import { useState, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { runAllocationAnalysis } from '../backtest/allocationBacktest';
import { DEFAULT_BACKTEST_START_DATE, BACKTEST_DATE_PRESETS } from '../constants/backtestDates';
import AllocationEquityCurve from './AllocationEquityCurve';
import StatsPanel from './StatsPanel';

export default function FormulaDetail({ assetData, ratioData, paxgData, loading }) {
  const { key } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fallbackPath = '/allocation';
  const fromPath = location.state?.from || fallbackPath;

  function handleBack() {
    navigate(fromPath);
  }

  const [selectedPreset, setSelectedPreset] = useState(DEFAULT_BACKTEST_START_DATE);
  const [customDate, setCustomDate] = useState(DEFAULT_BACKTEST_START_DATE);

  const activeDateStr = selectedPreset === 'custom' ? customDate : selectedPreset;
  const backtestStart = new Date(activeDateStr + 'T00:00:00Z').getTime();

  const data = useMemo(() => {
    if (!assetData || assetData.length === 0 || !ratioData?.dominance) return null;
    const mttiAssets = assetData.filter(a => a.config.strategy !== 'LTTI');
    if (mttiAssets.length === 0) return null;
    const ltti3dAsset = assetData.find(a => a.config.strategy === 'LTTI' && a.config.interval === '3d') ?? null;
    const ltti2dAsset = assetData.find(a => a.config.strategy === 'LTTI' && a.config.interval === '2d') ?? null;
    return runAllocationAnalysis(mttiAssets, ratioData.dominance, ratioData.pairs, backtestStart, ltti3dAsset, paxgData, ltti2dAsset);
  }, [assetData, ratioData, paxgData, backtestStart]);

  const details = data?.formulaDetails?.[key];
  const formulaInfo = data?.comparison?.find(r => r.formula === key);

  const btcBuyHold = useMemo(() => {
    if (!assetData || assetData.length === 0) return null;
    const btcAsset = assetData.find(a => a.config.strategy === 'MTTI-BTC');
    if (!btcAsset) return null;
    const candles = btcAsset.candles;
    const startIdx = candles.findIndex(c => c.time >= backtestStart);
    if (startIdx === -1) return null;
    const firstClose = candles[startIdx].close;
    if (firstClose === 0) return null;
    const initialCapital = 1000;
    const equity = candles.slice(startIdx).map(c => ({
      time: c.time,
      value: initialCapital * (c.close / firstClose),
    }));
    const bhReturn = ((candles[candles.length - 1].close - firstClose) / firstClose) * 100;
    return { equity, bhReturn: bhReturn.toFixed(2) };
  }, [assetData, backtestStart]);

  const statsWithBH = useMemo(() => {
    if (!details?.stats) return null;
    return { ...details.stats, buyHoldReturn: btcBuyHold?.bhReturn ?? '--' };
  }, [details, btcBuyHold]);

  const maxNonBtcAllocation = useMemo(() => {
    if (!details?.barAllocations || details.barAllocations.length === 0) return null;
    let maxPct = 0;
    for (const bar of details.barAllocations) {
      const nonBtcPct = Object.entries(bar.weights || {})
        .filter(([asset]) => asset !== 'BTC')
        .reduce((sum, [, pct]) => sum + pct, 0);
      if (nonBtcPct > maxPct) maxPct = nonBtcPct;
    }
    return maxPct;
  }, [details]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading data...</p>
      </div>
    );
  }

  if (!details || !formulaInfo) {
    return (
      <div className="detail-page">
        <span className="back-link" onClick={handleBack}>
          &larr; Back
        </span>
        <div className="error-msg">Formula &ldquo;{key}&rdquo; not found.</div>
      </div>
    );
  }

  function handlePresetChange(e) {
    const val = e.target.value;
    setSelectedPreset(val);
    if (val !== 'custom') setCustomDate(val);
  }

  return (
    <div className="detail-page">
      <span className="back-link" onClick={handleBack}>
        &larr; Back
      </span>

      <div className="detail-header">
        <div>
          <h2>Formula {formulaInfo.displayFormula || key}</h2>
          <span style={{ fontSize: ['I', 'O', 'P', 'Q', 'R'].includes(key) ? '0.8rem' : '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
            {formulaInfo.label}
          </span>
        </div>
      </div>

      <div className="section">
        <div className="controls-row">
          <label className="control-label">Backtest from:</label>
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
              onChange={e => setCustomDate(e.target.value)}
              className="control-input"
            />
          )}
        </div>
        {key === 'M' && maxNonBtcAllocation !== null && (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: -4 }}>
            Max non-BTC allocation in selected window: {maxNonBtcAllocation.toFixed(2)}%
          </div>
        )}
      </div>

      <div className="section">
        <h3 className="section-title">Allocation</h3>
        <div className="table-scroll">
          <table className="score-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Asset</th>
                <th style={{ textAlign: 'right' }}>Sortino</th>
                <th style={{ textAlign: 'center' }}>Signal</th>
                <th style={{ textAlign: 'right' }}>Dominance Score</th>
                <th style={{ textAlign: 'right' }}>Allocation</th>
              </tr>
            </thead>
            <tbody>
              {details.assetTable.map((a, idx) => (
                <tr key={a.name}>
                  <td>{idx + 1}</td>
                  <td style={{ fontWeight: 600 }}>{a.name}</td>
                  <td style={{ textAlign: 'right' }}>{a.sortino}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`signal-badge ${a.signal.toLowerCase()}`}>
                      {a.signal}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{a.domScore}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {a.allocation.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section">
        <h3 className="section-title">Portfolio Backtest Performance</h3>
        <StatsPanel stats={statsWithBH} />
      </div>

      <div className="section">
        <h3 className="section-title">Portfolio Equity Curve</h3>
        <AllocationEquityCurve
          equity={details.equity}
          barAllocations={details.barAllocations}
          assetNames={data.assetNames}
          buyHoldEquity={btcBuyHold?.equity}
        />
      </div>
    </div>
  );
}
