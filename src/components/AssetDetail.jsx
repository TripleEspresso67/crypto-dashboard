import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PriceChart from './PriceChart';
import EquityCurve from './EquityCurve';
import ScoreTable from './ScoreTable';
import StatsPanel from './StatsPanel';
import TradeList from './TradeList';
import { runBacktest, DEFAULT_BACKTEST_START } from '../backtest/engine';
import { MTTI_BTC_PARAMS } from '../strategies/mttiBtcConfig';
import { MTTI_OTHERS_PARAMS } from '../strategies/mttiOthersConfig';
import { LTTI_PARAMS } from '../strategies/lttiConfig';

const STRATEGY_PARAMS = {
  'LTTI': LTTI_PARAMS,
  'MTTI-BTC': MTTI_BTC_PARAMS,
  'MTTI-others': MTTI_OTHERS_PARAMS,
};

const DATE_PRESETS = [
  { label: '1 Jan 2020', value: '2020-01-01' },
  { label: '1 Jan 2021', value: '2021-01-01' },
  { label: '1 Jan 2022', value: '2022-01-01' },
  { label: '1 Jan 2023', value: '2023-01-01' },
  { label: '1 Jan 2024', value: '2024-01-01' },
  { label: '1 Jan 2025', value: '2025-01-01' },
  { label: 'Custom', value: 'custom' },
];

function toDateStr(ts) {
  const d = new Date(ts);
  return d.toISOString().split('T')[0];
}

export default function AssetDetail({ assetData, loading }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const idx = parseInt(id, 10);

  const defaultDateStr = toDateStr(DEFAULT_BACKTEST_START);
  const [selectedPreset, setSelectedPreset] = useState(defaultDateStr);
  const [customDate, setCustomDate] = useState(defaultDateStr);

  const activeDateStr = selectedPreset === 'custom' ? customDate : selectedPreset;
  const backtestStart = new Date(activeDateStr + 'T00:00:00Z').getTime();

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading data...</p>
      </div>
    );
  }

  if (!assetData || !assetData[idx]) {
    return (
      <div className="detail-page">
        <span className="back-link" onClick={() => navigate('/')}>
          &larr; Crypto Strategy Dashboard
        </span>
        <div className="error-msg">Asset not found.</div>
      </div>
    );
  }

  const asset = assetData[idx];
  const lastCandle = asset.candles[asset.candles.length - 1];
  const lastScore = asset.compositeScores[asset.compositeScores.length - 1];
  const lastSignal = asset.signals[asset.signals.length - 1];

  const recomputedBacktest = useMemo(() => {
    const stratParams = STRATEGY_PARAMS[asset.config.strategy];
    return runBacktest(
      asset.candles,
      asset.compositeScores,
      stratParams.longThresh,
      stratParams.shortThresh,
      backtestStart
    );
  }, [asset.candles, asset.compositeScores, asset.config.strategy, backtestStart]);

  function formatPrice(p) {
    if (p >= 1000) return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (p >= 1) return `$${p.toFixed(4)}`;
    return `$${p.toFixed(6)}`;
  }

  function handlePresetChange(e) {
    const val = e.target.value;
    setSelectedPreset(val);
    if (val !== 'custom') {
      setCustomDate(val);
    }
  }

  return (
    <div className="detail-page">
      <span className="back-link" onClick={() => navigate('/')}>
        &larr; Crypto Strategy Dashboard
      </span>

      <div className="detail-header">
        <div>
          <h2>{asset.config.label}</h2>
          <span className="composite-score" style={{ fontSize: '1rem' }}>
            Composite Score: {lastScore.toFixed(3)} &mdash;{' '}
            <span className={`signal-badge ${lastSignal.toLowerCase()}`}>
              {lastSignal}
            </span>
          </span>
        </div>
        <div className="detail-price">{formatPrice(lastCandle.close)}</div>
      </div>

      <div className="section">
        <h3 className="section-title">Price Chart</h3>
        <PriceChart
          candles={asset.candles}
          signals={asset.signals}
          backtestStart={backtestStart}
        />
      </div>

      <div className="section">
        <h3 className="section-title">Indicator Scoreboard</h3>
        <ScoreTable
          indicatorResults={asset.indicatorResults}
          candles={asset.candles}
        />
      </div>

      <div className="section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h3 className="section-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
            Backtest Performance
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Backtest from:
            </label>
            <select
              value={selectedPreset}
              onChange={handlePresetChange}
              style={{
                padding: '5px 10px', fontSize: '0.8rem',
                background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', borderRadius: 4,
              }}
            >
              {DATE_PRESETS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            {selectedPreset === 'custom' && (
              <input
                type="date"
                value={customDate}
                onChange={e => setCustomDate(e.target.value)}
                style={{
                  padding: '5px 10px', fontSize: '0.8rem',
                  background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                  border: '1px solid var(--border)', borderRadius: 4,
                }}
              />
            )}
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <StatsPanel stats={recomputedBacktest.stats} />
        </div>
      </div>

      <div className="section">
        <h3 className="section-title">Equity Curve</h3>
        <EquityCurve equity={recomputedBacktest.equity} />
      </div>

      <div className="section">
        <h3 className="section-title">Trade History</h3>
        <TradeList trades={recomputedBacktest.trades} />
      </div>
    </div>
  );
}
