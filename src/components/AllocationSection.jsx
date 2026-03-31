import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { runAllocationAnalysis } from '../backtest/allocationBacktest';
import { DEFAULT_BACKTEST_START_DATE, BACKTEST_DATE_PRESETS } from '../constants/backtestDates';
import FormulaEquityChart, { FORMULA_COLORS } from './FormulaEquityChart';

export default function AllocationSection({ assetData, ratioData, paxgData }) {
  const navigate = useNavigate();
  const [selectedPreset, setSelectedPreset] = useState(DEFAULT_BACKTEST_START_DATE);
  const [customDate, setCustomDate] = useState(DEFAULT_BACKTEST_START_DATE);

  const activeDateStr = selectedPreset === 'custom' ? customDate : selectedPreset;
  const backtestStart = new Date(activeDateStr + 'T00:00:00Z').getTime();

  const data = useMemo(() => {
    if (!assetData || assetData.length === 0 || !ratioData?.dominance) return null;
    const mttiAssets = assetData.filter(a => a.config.strategy !== 'LTTI');
    if (mttiAssets.length === 0) return null;
    const lttiAsset = assetData.find(a => a.config.strategy === 'LTTI') ?? null;
    return runAllocationAnalysis(mttiAssets, ratioData.dominance, backtestStart, lttiAsset, paxgData);
  }, [assetData, ratioData, paxgData, backtestStart]);

  const formulaEquities = useMemo(() => {
    if (!data?.formulaDetails) return {};
    const out = {};
    for (const key of Object.keys(data.formulaDetails)) {
      out[key] = data.formulaDetails[key].equity;
    }
    return out;
  }, [data]);

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
    return { equity };
  }, [assetData, backtestStart]);

  if (!data) return null;

  function handlePresetChange(e) {
    const val = e.target.value;
    setSelectedPreset(val);
    if (val !== 'custom') setCustomDate(val);
  }

  return (
    <>
      <div className="section">
        <h3 className="section-title">Allocation Strategies</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
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
            {BACKTEST_DATE_PRESETS.map(p => (
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
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
          Portfolio backtest &mdash; CASH assets always receive 0% allocation.
          Click a formula to view its allocation breakdown and portfolio backtest.
        </p>
        <table className="score-table">
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Description</th>
              <th style={{ textAlign: 'right' }}>Total Return</th>
              <th style={{ textAlign: 'right' }}>Max Drawdown</th>
              <th style={{ textAlign: 'right' }}>Sortino</th>
              <th style={{ textAlign: 'right' }}>Omega</th>
              <th style={{ textAlign: 'right' }}>Overall Rank</th>
            </tr>
          </thead>
          <tbody>
            {data.comparison.map(r => (
                <tr
                  key={r.formula}
                  onClick={() => navigate(`/formula/${r.formula}`)}
                  style={{ cursor: 'pointer' }}
                  className="clickable-row"
                >
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                    <span style={{ color: FORMULA_COLORS[r.formula] || 'inherit' }}>{r.formula}</span>
                  </td>
                  <td style={{ fontSize: r.formula === 'I' ? '0.72rem' : '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                    {r.label}
                  </td>
                  <td style={{ textAlign: 'right' }}>{r.totalReturn}%</td>
                  <td style={{ textAlign: 'right' }}>{r.maxDrawdown}%</td>
                  <td style={{ textAlign: 'right' }}>{r.sortino}</td>
                  <td style={{ textAlign: 'right' }}>{r.omega}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.overallRank}</td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section">
        <h3 className="section-title">Allocation Strategy Equity Comparison</h3>
        <FormulaEquityChart
          formulaEquities={formulaEquities}
          buyHoldEquity={btcBuyHold?.equity}
        />
      </div>
    </>
  );
}
