import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { runBacktest } from '../backtest/engine';
import { MTTI_BTC_PARAMS } from '../strategies/mttiBtcConfig';
import { MTTI_OTHERS_PARAMS } from '../strategies/mttiOthersConfig';
import { LTTI_PARAMS } from '../strategies/lttiConfig';
import { BACKTEST_DATE_PRESETS, DEFAULT_BACKTEST_START_DATE } from '../constants/backtestDates';
import { formatUtcDate } from '../dateTime';

function rankDescending(values) {
  const indices = values.map((_, i) => i);
  indices.sort((a, b) => values[b] - values[a]);
  const ranks = new Array(values.length);
  for (let r = 0; r < indices.length; r++) ranks[indices[r]] = r + 1;
  return ranks;
}

function parseNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? -Infinity : n;
}

const STRATEGY_PARAMS = {
  'LTTI': LTTI_PARAMS,
  'MTTI-BTC': MTTI_BTC_PARAMS,
  'MTTI-others': MTTI_OTHERS_PARAMS,
};

export default function Overview({ assetData, loading, error }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedPreset, setSelectedPreset] = useState(DEFAULT_BACKTEST_START_DATE);
  const [customDate, setCustomDate] = useState(DEFAULT_BACKTEST_START_DATE);

  const activeDateStr = selectedPreset === 'custom' ? customDate : selectedPreset;

  const tableBacktestStart = useMemo(() => {
    const parsed = Date.parse(`${activeDateStr}T00:00:00Z`);
    return isNaN(parsed) ? Date.parse(`${DEFAULT_BACKTEST_START_DATE}T00:00:00Z`) : parsed;
  }, [activeDateStr]);

  const assetPerf = useMemo(() => {
    if (!assetData || assetData.length === 0) return [];
    const rows = assetData.map((a, idx) => {
      const sourceIndex = Number.isInteger(a.sourceIndex) ? a.sourceIndex : idx;
      const stratParams = STRATEGY_PARAMS[a.config.strategy];
      const stats = runBacktest(
        a.candles,
        a.compositeScores,
        stratParams?.longThresh ?? 0.1,
        stratParams?.shortThresh ?? -0.1,
        tableBacktestStart
      ).stats;

      return {
        idx: sourceIndex,
        name: a.config.name,
        strategy: `${a.config.strategy} ${a.config.interval.toUpperCase()}`,
        totalReturn: stats?.totalReturn ?? '--',
        maxDrawdown: stats?.maxDrawdown ?? '--',
        sortino: stats?.sortino ?? '--',
        omega: stats?.omega ?? '--',
        kelly: stats?.kelly ?? '--',
      };
    });

    const retVals = rows.map(r => parseNum(r.totalReturn));
    const ddVals = rows.map(r => -parseNum(r.maxDrawdown));
    const sorVals = rows.map(r => parseNum(r.sortino));
    const omgVals = rows.map(r => parseNum(r.omega));
    const kelVals = rows.map(r => parseNum(r.kelly));

    const retRanks = rankDescending(retVals);
    const ddRanks = rankDescending(ddVals);
    const sorRanks = rankDescending(sorVals);
    const omgRanks = rankDescending(omgVals);
    const kelRanks = rankDescending(kelVals);

    const cumScores = rows.map((_, i) => retRanks[i] + ddRanks[i] + sorRanks[i] + omgRanks[i] + kelRanks[i]);
    const indices = rows.map((_, i) => i);
    indices.sort((a, b) => cumScores[a] - cumScores[b]);
    const overallRanks = new Array(rows.length);
    for (let r = 0; r < indices.length; r++) overallRanks[indices[r]] = r + 1;

    for (let i = 0; i < rows.length; i++) rows[i].overallRank = overallRanks[i];
    rows.sort((a, b) => a.overallRank - b.overallRank);
    return rows;
  }, [assetData, tableBacktestStart]);

  if (error) {
    return <div className="error-msg">{error}</div>;
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Fetching market data and computing indicators...</p>
        <p style={{ fontSize: '0.8rem', marginTop: 8, color: 'var(--text-muted)' }}>
          This may take a moment on first load
        </p>
      </div>
    );
  }

  function handlePresetChange(e) {
    const val = e.target.value;
    setSelectedPreset(val);
    if (val !== 'custom') {
      setCustomDate(val);
    }
  }

  function formatPrice(p) {
    if (p >= 1000) return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (p >= 1) return `$${p.toFixed(4)}`;
    return `$${p.toFixed(6)}`;
  }

  return (
    <div>
      <div className="section">
        <h3 className="section-title">Asset Strategies</h3>
        <div className="overview-grid">
          {assetData.map((asset, idx) => {
            const sourceIndex = Number.isInteger(asset.sourceIndex) ? asset.sourceIndex : idx;
            const lastCandle = asset.candles[asset.candles.length - 1];
            const lastScore = asset.compositeScores[asset.compositeScores.length - 1];
            const lastSignal = asset.signals[asset.signals.length - 1];

            let lastSignalChange = NaN;
            for (let i = asset.signals.length - 2; i >= 0; i--) {
              if (asset.signals[i] !== lastSignal) {
                lastSignalChange = asset.candles[i + 1].time;
                break;
              }
            }

            return (
              <div
                key={sourceIndex}
                className="asset-card"
                onClick={() => navigate(`/asset/${sourceIndex}`, { state: { from: location.pathname } })}
              >
                <div className="card-header">
                  <span className="asset-name">{asset.config.name}</span>
                  <span className="strategy-badge">{asset.config.strategy} {asset.config.interval.toUpperCase()}</span>
                </div>
                <div className="price">{formatPrice(lastCandle.close)}</div>
                <div className="score-row">
                  <span className="composite-score">
                    Score: {lastScore.toFixed(2)}
                  </span>
                  <span className={`signal-badge ${lastSignal.toLowerCase()}`}>
                    {lastSignal}
                  </span>
                </div>
                {!isNaN(lastSignalChange) && (
                  <div className="last-change">
                    Signal since {formatUtcDate(lastSignalChange, '')} UTC
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {assetPerf.length > 0 && (
        <div className="section">
          <div
            className="section-title"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
          >
            <h3 style={{ margin: 0, fontSize: 'inherit', fontWeight: 'inherit' }}>Asset Strategy Performance</h3>
            <label className="controls-row" style={{ marginBottom: 0 }}>
              <span className="control-label">Backtest from</span>
              <select
                value={selectedPreset}
                onChange={handlePresetChange}
                className="control-input"
              >
                {BACKTEST_DATE_PRESETS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              {selectedPreset === 'custom' && (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="control-input"
                />
              )}
            </label>
          </div>
          <div className="table-scroll">
            <table className="score-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Strategy</th>
                  <th style={{ textAlign: 'right' }}>Total Return</th>
                  <th style={{ textAlign: 'right' }}>Max Drawdown</th>
                  <th style={{ textAlign: 'right' }}>Sortino</th>
                  <th style={{ textAlign: 'right' }}>Omega</th>
                  <th style={{ textAlign: 'right' }}>Kelly</th>
                  <th style={{ textAlign: 'right' }}>Overall Rank</th>
                </tr>
              </thead>
              <tbody>
                {assetPerf.map(r => (
                  <tr
                    key={r.idx}
                    onClick={() => navigate(`/asset/${r.idx}`, { state: { from: location.pathname } })}
                    style={{ cursor: 'pointer' }}
                    className="clickable-row"
                  >
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{r.strategy}</td>
                    <td style={{ textAlign: 'right' }}>{r.totalReturn}%</td>
                    <td style={{ textAlign: 'right' }}>{r.maxDrawdown}%</td>
                    <td style={{ textAlign: 'right' }}>{r.sortino}</td>
                    <td style={{ textAlign: 'right' }}>{r.omega}</td>
                    <td style={{ textAlign: 'right' }}>{r.kelly}%</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.overallRank}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
