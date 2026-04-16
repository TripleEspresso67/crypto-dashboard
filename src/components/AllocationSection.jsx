import { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { runAllocationAnalysis } from '../backtest/allocationBacktest';
import { DEFAULT_BACKTEST_START_DATE, BACKTEST_DATE_PRESETS } from '../constants/backtestDates';
import FormulaEquityChart, { FORMULA_COLORS } from './FormulaEquityChart';

export default function AllocationSection({ assetData, ratioData, paxgData }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedPreset, setSelectedPreset] = useState(DEFAULT_BACKTEST_START_DATE);
  const [customDate, setCustomDate] = useState(DEFAULT_BACKTEST_START_DATE);
  const [sortKey, setSortKey] = useState('totalReturn');
  const [visibleFormulas, setVisibleFormulas] = useState(['A']);
  const [favoriteFormula, setFavoriteFormula] = useState(() => {
    try {
      const saved = localStorage.getItem('favoriteAllocationStrategy');
      return saved || null;
    } catch (_) {
      return null;
    }
  });

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

  const formulaEquities = useMemo(() => {
    if (!data?.formulaDetails) return {};
    const out = {};
    for (const key of Object.keys(data.formulaDetails)) {
      out[key] = data.formulaDetails[key].equity;
    }
    return out;
  }, [data]);

  const sortedComparison = useMemo(() => {
    if (!data?.comparison) return [];
    const rows = data.comparison.slice();
    rows.sort((a, b) => {
      const av = parseFloat(a[sortKey]);
      const bv = parseFloat(b[sortKey]);
      const aVal = isNaN(av) ? -Infinity : av;
      const bVal = isNaN(bv) ? -Infinity : bv;
      if (
        sortKey === 'simpleRank' ||
        sortKey === 'normalizedRank' ||
        sortKey === 'performanceRank' ||
        sortKey === 'totalTrades' ||
        sortKey === 'numberOfExecutions' ||
        sortKey === 'maxDrawdown'
      ) return aVal - bVal;
      return bVal - aVal;
    });
    return rows;
  }, [data, sortKey]);

  useEffect(() => {
    if (!data?.comparison || data.comparison.length === 0) return;
    const available = new Set(data.comparison.map(r => r.formula));
    setVisibleFormulas(prev => {
      const filtered = prev.filter(f => available.has(f));
      if (filtered.length > 0) return filtered;
      const defaults = ['A'].filter(f => available.has(f));
      if (defaults.length > 0) return defaults;
      return data.comparison.length > 0 ? [data.comparison[0].formula] : [];
    });
  }, [data]);

  const visibleFormulaEquities = useMemo(() => {
    const out = {};
    for (const key of visibleFormulas) {
      if (formulaEquities[key]) out[key] = formulaEquities[key];
    }
    return out;
  }, [formulaEquities, visibleFormulas]);

  if (!data) return null;

  function handlePresetChange(e) {
    const val = e.target.value;
    setSelectedPreset(val);
    if (val !== 'custom') setCustomDate(val);
  }

  function toggleFavorite(formula) {
    const next = favoriteFormula === formula ? null : formula;
    setFavoriteFormula(next);
    try {
      if (next) localStorage.setItem('favoriteAllocationStrategy', next);
      else localStorage.removeItem('favoriteAllocationStrategy');
    } catch (_) {
      // Ignore storage failures and keep in-memory state.
    }
  }

  function toggleFormulaVisibility(formula) {
    setVisibleFormulas(prev => {
      if (prev.includes(formula)) return prev.filter(f => f !== formula);
      return [...prev, formula];
    });
  }

  return (
    <>
      <div>
        <div className="section">
          <h3 className="section-title">Allocation Strategy Equity Comparison</h3>
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
          <p className="helper-text" style={{ marginBottom: 6 }}>
            Portfolio backtest &mdash; CASH assets always receive 0% allocation.
          </p>
          <FormulaEquityChart
            formulaEquities={visibleFormulaEquities}
            formulaDisplayMap={Object.fromEntries((data?.comparison || []).map(r => [r.formula, r.displayFormula || r.formula]))}
          />
        </div>

        <div className="section">
          <h3 className="section-title">Allocation Strategies</h3>
          <div className="helper-text" style={{ marginBottom: 6 }}>
            Click any strategy row to view its full allocation breakdown and portfolio backtest.
          </div>
          <div className="helper-text" style={{ marginBottom: 12 }}>
            Dominance-based strategies use time-based dominance, calculated bar-by-bar from the All Pair Ratios data.
          </div>
          <div className="helper-text" style={{ marginBottom: 12 }}>
            Normalised Rank uses per-column min-max normalization across strategies for Total Return, Number of Trades, Number of Executions, Max Drawdown, Sortino, Omega, Calmar, and Kelly. For Number of Trades, Number of Executions, and Max Drawdown, lower values are better. The eight normalized scores are summed, then ranked (highest sum = rank 1).
          </div>
          <div className="helper-text" style={{ marginBottom: 12 }}>
            Performance Rank uses the same normalization method but only for Total Return and Max Drawdown. Lower Max Drawdown is better.
          </div>
          <div className="table-scroll">
            <table className="score-table wide-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'center' }} title="Show or hide strategy on chart">Plot</th>
                  <th style={{ textAlign: 'center' }} title="Favorite strategy">Star</th>
                  <th>Strategy</th>
                  <th
                    style={{ textAlign: 'center', cursor: 'pointer' }}
                    title="Sort highest to lowest"
                    onClick={() => setSortKey('totalReturn')}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1, gap: 2 }}>
                      <span>Total Return</span>
                      <span>&#9662;</span>
                    </div>
                  </th>
                  <th
                    style={{ textAlign: 'center', cursor: 'pointer' }}
                    title="Sort lowest to highest"
                    onClick={() => setSortKey('totalTrades')}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1, gap: 2 }}>
                      <span>Number of Trades</span>
                      <span>&#9662;</span>
                    </div>
                  </th>
                  <th
                    style={{ textAlign: 'center', cursor: 'pointer' }}
                    title="Sort lowest to highest"
                    onClick={() => setSortKey('numberOfExecutions')}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1, gap: 2 }}>
                      <span>Number of Executions</span>
                      <span>&#9662;</span>
                    </div>
                  </th>
                  <th
                    style={{ textAlign: 'center', cursor: 'pointer' }}
                    title="Sort lowest to highest"
                    onClick={() => setSortKey('maxDrawdown')}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1, gap: 2 }}>
                      <span>Max Drawdown</span>
                      <span>&#9662;</span>
                    </div>
                  </th>
                  <th
                    style={{ textAlign: 'center', cursor: 'pointer' }}
                    title="Sort highest to lowest"
                    onClick={() => setSortKey('sortino')}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1, gap: 2 }}>
                      <span>Sortino</span>
                      <span>&#9662;</span>
                    </div>
                  </th>
                  <th
                    style={{ textAlign: 'center', cursor: 'pointer' }}
                    title="Sort highest to lowest"
                    onClick={() => setSortKey('omega')}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1, gap: 2 }}>
                      <span>Omega Ratio</span>
                      <span>&#9662;</span>
                    </div>
                  </th>
                  <th
                    style={{ textAlign: 'center', cursor: 'pointer' }}
                    title="Sort highest to lowest"
                    onClick={() => setSortKey('calmar')}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1, gap: 2 }}>
                      <span>Calmar Ratio</span>
                      <span>&#9662;</span>
                    </div>
                  </th>
                  <th
                    style={{ textAlign: 'center', cursor: 'pointer' }}
                    title="Sort highest to lowest"
                    onClick={() => setSortKey('kelly')}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1, gap: 2 }}>
                      <span>Kelly</span>
                      <span>&#9662;</span>
                    </div>
                  </th>
                  <th
                    style={{ textAlign: 'center', cursor: 'pointer' }}
                    title="Sort highest to lowest"
                    onClick={() => setSortKey('simpleRank')}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1, gap: 2 }}>
                      <span>Simple Rank</span>
                      <span>&#9662;</span>
                    </div>
                  </th>
                  <th
                    style={{ textAlign: 'center', cursor: 'pointer' }}
                    title="Sort lowest to highest"
                    onClick={() => setSortKey('normalizedRank')}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1, gap: 2 }}>
                      <span>Normalised Rank</span>
                      <span>&#9662;</span>
                    </div>
                  </th>
                  <th
                    style={{ textAlign: 'center', cursor: 'pointer' }}
                    title="Sort lowest to highest"
                    onClick={() => setSortKey('performanceRank')}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1, gap: 2 }}>
                      <span>Performance Rank</span>
                      <span>&#9662;</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedComparison.map(r => (
                    <tr
                      key={r.formula}
                      onClick={() => navigate(`/formula/${r.formula}`, { state: { from: location.pathname } })}
                      style={{ cursor: 'pointer' }}
                      className="clickable-row"
                    >
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            toggleFormulaVisibility(r.formula);
                          }}
                          title={visibleFormulas.includes(r.formula) ? 'Hide strategy from chart' : 'Show strategy on chart'}
                          aria-label={visibleFormulas.includes(r.formula) ? `Hide strategy ${r.formula} from chart` : `Show strategy ${r.formula} on chart`}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: visibleFormulas.includes(r.formula) ? '#e3b341' : '#4b5563',
                            fontSize: '1rem',
                            lineHeight: 1,
                            padding: 0,
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <svg width="19.2" height="19.2" viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              d="M12 2a7 7 0 0 0-4.7 12.2c1 .9 1.7 2 1.9 3.3h5.6c.2-1.3.9-2.4 1.9-3.3A7 7 0 0 0 12 2Z"
                              fill="currentColor"
                            />
                            <path
                              d="M9.5 19h5M10.2 21h3.6"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.6"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            toggleFavorite(r.formula);
                          }}
                          title={favoriteFormula === r.formula ? 'Unstar strategy' : 'Star strategy'}
                          aria-label={favoriteFormula === r.formula ? `Unstar strategy ${r.formula}` : `Star strategy ${r.formula}`}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: favoriteFormula === r.formula ? '#ffffff' : '#8b949e',
                            fontSize: '1.6rem',
                            lineHeight: 1,
                            padding: 0,
                          }}
                        >
                          {favoriteFormula === r.formula ? '★' : '☆'}
                        </button>
                      </td>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        <span style={{ color: FORMULA_COLORS[r.formula] || 'inherit' }}>{r.displayFormula || r.formula}</span>
                        <span
                          title={r.label}
                          aria-label={`Strategy ${r.displayFormula || r.formula} description`}
                          style={{
                            marginLeft: 8,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 15,
                            height: 15,
                            borderRadius: '50%',
                            border: '1px solid var(--text-muted)',
                            color: 'var(--text-secondary)',
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            verticalAlign: 'middle',
                          }}
                        >
                          i
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>{r.totalReturn}%</td>
                      <td style={{ textAlign: 'center' }}>{r.totalTrades}</td>
                      <td style={{ textAlign: 'center' }}>{r.numberOfExecutions}</td>
                      <td style={{ textAlign: 'center' }}>{r.maxDrawdown}%</td>
                      <td style={{ textAlign: 'center' }}>{r.sortino}</td>
                      <td style={{ textAlign: 'center' }}>{r.omega}</td>
                      <td style={{ textAlign: 'center' }}>{r.calmar}</td>
                      <td style={{ textAlign: 'center' }}>{r.kelly}%</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{r.simpleRank}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{r.normalizedRank}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{r.performanceRank}</td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
