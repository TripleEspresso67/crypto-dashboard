import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAllCandles } from '../api/binance';
import { runStrategy } from '../strategies/scorer';
import { runBacktest } from '../backtest/engine';
import { MTTI_BTC_PARAMS } from '../strategies/mttiBtcConfig';
import { MTTI_OTHERS_PARAMS } from '../strategies/mttiOthersConfig';
import { BACKTEST_DATE_PRESETS } from '../constants/backtestDates';

const SANDBOX_DEFAULT_BACKTEST_DATE = '2021-08-01';

const SANDBOX_BACKTEST_DATE_PRESETS = [
  { label: '1 Aug 2021', value: '2021-08-01' },
  ...BACKTEST_DATE_PRESETS,
];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WARMUP_START = new Date('2021-01-01T00:00:00Z').getTime();

function formatDateLabel(dateStr) {
  if (!dateStr) return '';
  const preset = BACKTEST_DATE_PRESETS.find(p => p.value === dateStr);
  if (preset && preset.value !== 'custom') return preset.label;
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Group hourly candles into 24h bars that start at `startHourUtc` each UTC day.
 * Only fully-formed bars (with 24 contiguous hourly candles) are kept so that
 * indicators see consistent OHLCV input.
 */
function buildDailyBarsFromHourly(hourlyCandles, startHourUtc) {
  const bars = [];
  let currentBar = null;

  const emitIfComplete = () => {
    if (currentBar && currentBar.count === 24) {
      bars.push({
        time: currentBar.time,
        open: currentBar.open,
        high: currentBar.high,
        low: currentBar.low,
        close: currentBar.close,
        volume: currentBar.volume,
        closeTime: currentBar.time + DAY_MS - 1,
      });
    }
  };

  for (const c of hourlyCandles) {
    const d = new Date(c.time);
    const hour = d.getUTCHours();
    const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const barStart = hour >= startHourUtc
      ? dayStart + startHourUtc * HOUR_MS
      : dayStart - DAY_MS + startHourUtc * HOUR_MS;

    if (!currentBar || currentBar.time !== barStart) {
      emitIfComplete();
      currentBar = {
        time: barStart,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        count: 1,
      };
    } else {
      currentBar.high = Math.max(currentBar.high, c.high);
      currentBar.low = Math.min(currentBar.low, c.low);
      currentBar.close = c.close;
      currentBar.volume += c.volume;
      currentBar.count += 1;
    }
  }

  emitIfComplete();
  return bars;
}

function parseSortinoForSort(val) {
  if (val === '--' || val === undefined || val === null) return -Infinity;
  if (val === 'Inf') return Infinity;
  if (val === '-Inf') return -Infinity;
  const n = parseFloat(val);
  return isNaN(n) ? -Infinity : n;
}

function TotalReturnBarChart({ results }) {
  if (!results || results.length === 0) return null;

  const width = 760;
  const height = 340;
  const padLeft = 64;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 56;
  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;

  const values = results.map(r => r.totalReturnNum).filter(v => isFinite(v));
  if (values.length === 0) return null;

  let minV = Math.min(0, ...values);
  let maxV = Math.max(0, ...values);
  const range = maxV - minV;
  if (range === 0) {
    maxV += 1;
    minV -= 1;
  } else {
    maxV += range * 0.08;
    minV -= range * 0.08;
  }

  const yScale = v => padTop + chartHeight * (1 - (v - minV) / (maxV - minV));
  const colWidth = chartWidth / 24;
  const barWidth = colWidth * 0.68;
  const xCenter = i => padLeft + colWidth * (i + 0.5);
  const zeroY = yScale(0);

  const tickCount = 5;
  const ticks = [];
  for (let i = 0; i <= tickCount; i++) {
    ticks.push(minV + (maxV - minV) * (i / tickCount));
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', maxHeight: 380, background: '#1c2128', borderRadius: 8 }}
    >
      {ticks.map((v, idx) => {
        const y = yScale(v);
        return (
          <g key={idx}>
            <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="#30363d" strokeWidth={1} />
            <text x={padLeft - 8} y={y + 4} textAnchor="end" fill="#8b949e" fontSize={11}>
              {v.toFixed(0)}%
            </text>
          </g>
        );
      })}

      <line
        x1={padLeft}
        x2={width - padRight}
        y1={zeroY}
        y2={zeroY}
        stroke="#6e7681"
        strokeWidth={1.5}
      />

      {results.map(r => {
        const v = r.totalReturnNum;
        if (!isFinite(v)) return null;
        const x = xCenter(r.hour) - barWidth / 2;
        const yTop = v >= 0 ? yScale(v) : zeroY;
        const h = Math.max(1, Math.abs(yScale(v) - zeroY));
        const color = v >= 0 ? '#3fb950' : '#f85149';
        return (
          <rect key={r.hour} x={x} y={yTop} width={barWidth} height={h} fill={color} rx={2}>
            <title>{`${String(r.hour).padStart(2, '0')}:00 UTC — ${r.totalReturn}% (${r.totalTrades} trades)`}</title>
          </rect>
        );
      })}

      {results.map(r => (
        <text
          key={r.hour}
          x={xCenter(r.hour)}
          y={height - padBottom + 16}
          textAnchor="middle"
          fill="#8b949e"
          fontSize={10}
        >
          {String(r.hour).padStart(2, '0')}
        </text>
      ))}

      <line x1={padLeft} y1={padTop} x2={padLeft} y2={height - padBottom} stroke="#30363d" strokeWidth={1} />
      <line
        x1={padLeft}
        y1={height - padBottom}
        x2={width - padRight}
        y2={height - padBottom}
        stroke="#30363d"
        strokeWidth={1}
      />

      <text
        x={(padLeft + width - padRight) / 2}
        y={height - 12}
        textAnchor="middle"
        fill="#c9d1d9"
        fontSize={12}
      >
        Bar Close (UTC)
      </text>

      <text
        x={16}
        y={(padTop + height - padBottom) / 2}
        textAnchor="middle"
        fill="#c9d1d9"
        fontSize={12}
        transform={`rotate(-90, 16, ${(padTop + height - padBottom) / 2})`}
      >
        Total Return (%)
      </text>
    </svg>
  );
}

/**
 * Multi-line chart that overlays the per-hour normalised Total Return,
 * Max Drawdown (inverted so larger = better), and Sortino Ratio for a single
 * asset's 24-variant backtest. Each line is independently min-max normalised
 * to 0..1 across the 24 hours.
 */
function NormalizedMetricsLineChart({ results }) {
  const normalised = useMemo(() => buildNormalizedRows(results), [results]);
  if (!normalised || normalised.length === 0) return null;

  const width = 760;
  const height = 320;
  const padLeft = 64;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 72;
  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;

  const yMin = 0;
  const yMax = 1;
  const yScale = v => padTop + chartHeight * (1 - (v - yMin) / (yMax - yMin));
  const colWidth = chartWidth / 24;
  const xCenter = i => padLeft + colWidth * (i + 0.5);

  const tickCount = 5;
  const ticks = [];
  for (let i = 0; i <= tickCount; i++) {
    ticks.push(yMin + (yMax - yMin) * (i / tickCount));
  }

  const series = [
    { key: 'trNorm', label: 'Total Return (norm)', color: '#3fb950' },
    { key: 'ddNorm', label: 'Max Drawdown (norm, inverted)', color: '#d29922' },
    { key: 'sortinoNorm', label: 'Sortino Ratio (norm)', color: '#22d3ee' },
  ];

  const pathFor = key => {
    let d = '';
    let started = false;
    for (const r of normalised) {
      const v = r[key];
      if (v === null || v === undefined || !isFinite(v)) continue;
      const x = xCenter(r.hour);
      const y = yScale(v);
      d += started ? ` L ${x.toFixed(2)} ${y.toFixed(2)}` : `M ${x.toFixed(2)} ${y.toFixed(2)}`;
      started = true;
    }
    return d;
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', maxHeight: 360, background: '#1c2128', borderRadius: 8 }}
    >
      {ticks.map((v, idx) => {
        const y = yScale(v);
        return (
          <g key={idx}>
            <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="#30363d" strokeWidth={1} />
            <text x={padLeft - 8} y={y + 4} textAnchor="end" fill="#8b949e" fontSize={11}>
              {v.toFixed(2)}
            </text>
          </g>
        );
      })}

      {series.map(s => (
        <path
          key={s.key}
          d={pathFor(s.key)}
          fill="none"
          stroke={s.color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {series.map(s => (
        <g key={`pts-${s.key}`}>
          {normalised.map(r => {
            const v = r[s.key];
            if (v === null || v === undefined || !isFinite(v)) return null;
            return (
              <circle
                key={`${s.key}-${r.hour}`}
                cx={xCenter(r.hour)}
                cy={yScale(v)}
                r={2.5}
                fill={s.color}
              >
                <title>{`${String(r.hour).padStart(2, '0')}:00 UTC — ${s.label}: ${v.toFixed(3)}`}</title>
              </circle>
            );
          })}
        </g>
      ))}

      {Array.from({ length: 24 }, (_, hour) => (
        <text
          key={hour}
          x={xCenter(hour)}
          y={height - padBottom + 16}
          textAnchor="middle"
          fill="#8b949e"
          fontSize={10}
        >
          {String(hour).padStart(2, '0')}
        </text>
      ))}

      <line x1={padLeft} y1={padTop} x2={padLeft} y2={height - padBottom} stroke="#30363d" strokeWidth={1} />
      <line
        x1={padLeft}
        y1={height - padBottom}
        x2={width - padRight}
        y2={height - padBottom}
        stroke="#30363d"
        strokeWidth={1}
      />

      <text
        x={(padLeft + width - padRight) / 2}
        y={height - 44}
        textAnchor="middle"
        fill="#c9d1d9"
        fontSize={12}
      >
        Bar Close (UTC)
      </text>

      <text
        x={16}
        y={(padTop + height - padBottom) / 2}
        textAnchor="middle"
        fill="#c9d1d9"
        fontSize={12}
        transform={`rotate(-90, 16, ${(padTop + height - padBottom) / 2})`}
      >
        Normalised value (0–1)
      </text>

      {series.map((s, idx) => {
        const x = padLeft + idx * 220;
        const y = height - 14;
        return (
          <g key={`legend-${s.key}`}>
            <rect x={x} y={y - 8} width={10} height={10} fill={s.color} rx={1} />
            <text x={x + 16} y={y + 1} fill="#c9d1d9" fontSize={11}>{s.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function BarCloseStrategySection({
  title,
  symbol,
  assetLabel,
  strategyName,
  strategyParams,
  backtestStart,
  backtestLabel,
  onResults,
}) {
  const [hourlyCandles, setHourlyCandles] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const candles = await fetchAllCandles(symbol, '1h', WARMUP_START);
        if (!cancelled) setHourlyCandles(candles);
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const results = useMemo(() => {
    if (!hourlyCandles || hourlyCandles.length === 0) return null;

    const rows = [];
    for (let hour = 0; hour < 24; hour++) {
      const bars = buildDailyBarsFromHourly(hourlyCandles, hour);
      if (bars.length < 50) continue;
      const { compositeScores } = runStrategy(bars, strategyParams);
      const backtest = runBacktest(
        bars,
        compositeScores,
        strategyParams.longThresh,
        strategyParams.shortThresh,
        backtestStart,
      );
      rows.push({
        hour,
        totalReturn: backtest.stats.totalReturn,
        totalReturnNum: parseFloat(backtest.stats.totalReturn),
        maxDrawdown: backtest.stats.maxDrawdown,
        maxDrawdownNum: parseFloat(backtest.stats.maxDrawdown),
        sortino: backtest.stats.sortino,
        sortinoNum: parseSortinoForSort(backtest.stats.sortino),
        totalTrades: backtest.stats.totalTrades,
      });
    }
    return rows;
  }, [hourlyCandles, strategyParams, backtestStart]);

  useEffect(() => {
    if (onResults) onResults(results);
  }, [results, onResults]);

  const extremes = useMemo(() => {
    if (!results || results.length === 0) return null;
    const finiteReturns = results.filter(r => isFinite(r.totalReturnNum));
    const finiteDrawdowns = results.filter(r => isFinite(r.maxDrawdownNum));
    const finiteSortinos = results.filter(r => isFinite(r.sortinoNum));
    return {
      bestReturn: finiteReturns.length ? Math.max(...finiteReturns.map(r => r.totalReturnNum)) : null,
      worstReturn: finiteReturns.length ? Math.min(...finiteReturns.map(r => r.totalReturnNum)) : null,
      bestDrawdown: finiteDrawdowns.length ? Math.min(...finiteDrawdowns.map(r => r.maxDrawdownNum)) : null,
      worstDrawdown: finiteDrawdowns.length ? Math.max(...finiteDrawdowns.map(r => r.maxDrawdownNum)) : null,
      bestSortino: finiteSortinos.length ? Math.max(...finiteSortinos.map(r => r.sortinoNum)) : null,
      worstSortino: finiteSortinos.length ? Math.min(...finiteSortinos.map(r => r.sortinoNum)) : null,
    };
  }, [results]);

  const cellStyle = (value, best, worst) => {
    if (!isFinite(value) || best === null || worst === null || best === worst) {
      return { textAlign: 'right' };
    }
    if (value === best) return { textAlign: 'right', color: '#3fb950', fontWeight: 600 };
    if (value === worst) return { textAlign: 'right', color: '#f85149', fontWeight: 600 };
    return { textAlign: 'right' };
  };

  return (
    <div className="section">
      <h3 className="section-title">{title}</h3>
      <div className="helper-text" style={{ marginBottom: 8 }}>
        {strategyName} strategy performance from <strong>{backtestLabel}</strong> to present, using 24-hour bars aligned to each UTC hour.
      </div>
      <div className="helper-text" style={{ marginBottom: 8 }}>
        Each row represents a different bar-close time. The bars are rebuilt from hourly {symbol} candles so that the bar closes at the listed UTC hour; the {strategyName} indicators and signals are then recomputed on these shifted bars and run through the standard backtest engine.
      </div>
      <div className="helper-text" style={{ marginBottom: 12 }}>
        Hourly data is fetched on first visit and may take several seconds. Best and worst values per column are highlighted.
      </div>

      {loadError && (
        <div className="error-msg">Failed to load hourly {assetLabel} data: {loadError}</div>
      )}

      {!hourlyCandles && !loadError && (
        <div className="loading">
          <div className="spinner" />
          <p>Loading hourly {assetLabel} candles…</p>
        </div>
      )}

      {results && results.length === 0 && (
        <div className="helper-text">Not enough hourly data to compute any variant.</div>
      )}

      {results && results.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="score-table">
              <thead>
                <tr>
                  <th>Bar close (UTC)</th>
                  <th style={{ textAlign: 'right' }}>Total Return</th>
                  <th style={{ textAlign: 'right' }}>Max Drawdown</th>
                  <th style={{ textAlign: 'right' }}>Sortino Ratio</th>
                  <th style={{ textAlign: 'right' }}>Trades</th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => (
                  <tr key={r.hour}>
                    <td style={{ fontWeight: 600 }}>{String(r.hour).padStart(2, '0')}:00</td>
                    <td style={cellStyle(r.totalReturnNum, extremes?.bestReturn, extremes?.worstReturn)}>
                      {r.totalReturn}%
                    </td>
                    <td style={cellStyle(r.maxDrawdownNum, extremes?.bestDrawdown, extremes?.worstDrawdown)}>
                      {r.maxDrawdown}%
                    </td>
                    <td style={cellStyle(r.sortinoNum, extremes?.bestSortino, extremes?.worstSortino)}>
                      {r.sortino}
                    </td>
                    <td style={{ textAlign: 'right' }}>{r.totalTrades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 20 }}>
            <TotalReturnBarChart results={results} />
          </div>

          <div style={{ marginTop: 24 }}>
            <div className="helper-text" style={{ marginBottom: 8 }}>
              Normalised Total Return, Max Drawdown, and Sortino Ratio per UTC bar-close hour. Each metric is independently min-max normalised across the 24 hours so all three sit on a 0–1 scale. Max Drawdown is inverted (1 = smallest drawdown / best, 0 = largest drawdown / worst), so for all three lines <strong>higher is better</strong>.
            </div>
            <NormalizedMetricsLineChart results={results} />
          </div>
        </>
      )}
    </div>
  );
}

const WINDOW_HOUR_FILTER = h => h >= 5 && h <= 22;
const WINDOW_LABEL = '05:00\u201322:30 UTC';

function bestBy(results, accessor, higherIsBetter, hourFilter = () => true) {
  if (!results) return null;
  const eligible = results.filter(r => hourFilter(r.hour) && isFinite(accessor(r)));
  if (eligible.length === 0) return null;
  return eligible.reduce((a, b) => {
    const va = accessor(a);
    const vb = accessor(b);
    if (higherIsBetter) return vb > va ? b : a;
    return vb < va ? b : a;
  });
}

function formatHour(hour) {
  return `${String(hour).padStart(2, '0')}:00 UTC`;
}

/**
 * Classify the robustness of the best hour for a given metric.
 *
 * Looks at the two UTC hours immediately adjacent to the best hour (wrapping on
 * the 24-hour ring) and checks where those neighbours rank among all 24 hours.
 *
 * - `cluster`  — both neighbours also rank in the top third (top 8 of 24).
 *                The best hour sits inside a coherent peak, so the result is
 *                more likely a real effect than statistical noise.
 * - `partial`  — exactly one neighbour ranks in the top third. Suggestive but
 *                not as strong.
 * - `isolated` — neither neighbour ranks in the top third. The best hour is
 *                an isolated spike and is very likely noise.
 */
function classifyHourRobustness(rows, accessor, higherIsBetter = true) {
  if (!rows || rows.length < 3) return null;
  const valid = rows.filter(r => isFinite(accessor(r)));
  if (valid.length < 3) return null;

  const sorted = [...valid].sort((a, b) =>
    higherIsBetter ? accessor(b) - accessor(a) : accessor(a) - accessor(b),
  );
  const rankByHour = new Map();
  sorted.forEach((r, i) => rankByHour.set(r.hour, i + 1));

  const best = sorted[0];
  const total = valid.length;
  const topThird = Math.max(2, Math.ceil(total / 3));

  const leftHour = (best.hour - 1 + 24) % 24;
  const rightHour = (best.hour + 1) % 24;
  const leftRank = rankByHour.get(leftHour) ?? null;
  const rightRank = rankByHour.get(rightHour) ?? null;

  const leftInTop = leftRank !== null && leftRank <= topThird;
  const rightInTop = rightRank !== null && rightRank <= topThird;

  let classification;
  if (leftInTop && rightInTop) classification = 'cluster';
  else if (leftInTop || rightInTop) classification = 'partial';
  else classification = 'isolated';

  return {
    bestHour: best.hour,
    leftHour,
    rightHour,
    leftRank,
    rightRank,
    topThird,
    total,
    classification,
  };
}

function robustnessVerdict(c) {
  if (!c) return { label: '—', color: 'var(--text-muted)', note: '' };
  if (c.classification === 'cluster') {
    return {
      label: 'Cluster',
      color: '#3fb950',
      note: 'best hour and both neighbours rank in the top third — likely a real effect.',
    };
  }
  if (c.classification === 'partial') {
    return {
      label: 'Partial cluster',
      color: '#d29922',
      note: 'one adjacent hour also ranks in the top third — suggestive but not conclusive.',
    };
  }
  return {
    label: 'Isolated spike',
    color: '#f85149',
    note: 'neither adjacent hour ranks in the top third — most likely statistical noise.',
  };
}

function normalizeTotalReturns(results) {
  if (!results || results.length === 0) return null;
  const finite = results.filter(r => isFinite(r.totalReturnNum));
  if (finite.length === 0) return null;
  const values = finite.map(r => r.totalReturnNum);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const map = new Map();
  for (const r of results) {
    if (!isFinite(r.totalReturnNum)) continue;
    const norm = range === 0 ? 0.5 : (r.totalReturnNum - min) / range;
    map.set(r.hour, norm);
  }
  return map;
}

function finiteMinMax(values) {
  const f = values.filter(v => isFinite(v));
  if (f.length === 0) return null;
  return { min: Math.min(...f), max: Math.max(...f) };
}

/**
 * Min-max normalise a single value to 0..1 using the supplied min/max envelope.
 * If `higherIsBetter` is false, the result is inverted so that 1 = best and
 * 0 = worst (used for Max Drawdown, where smaller is better).
 *
 * Infinite Sortino values are mapped to the appropriate extreme.
 */
function normaliseValue(v, mm, higherIsBetter) {
  if (mm === null) return null;
  if (v === Infinity) return higherIsBetter ? 1 : 0;
  if (v === -Infinity) return higherIsBetter ? 0 : 1;
  if (!isFinite(v)) return null;
  const range = mm.max - mm.min;
  if (range === 0) return 0.5;
  const raw = (v - mm.min) / range;
  return higherIsBetter ? raw : 1 - raw;
}

/**
 * For a single asset's 24-hour result rows, return per-hour normalised values
 * for Total Return, Max Drawdown (inverted), and Sortino Ratio. Each metric
 * is independently min-max normalised across the asset's own 24 hours.
 */
function buildNormalizedRows(results) {
  if (!results || results.length === 0) return null;
  const trMM = finiteMinMax(results.map(r => r.totalReturnNum));
  const ddMM = finiteMinMax(results.map(r => r.maxDrawdownNum));
  const sortMM = finiteMinMax(results.map(r => r.sortinoNum));
  return results.map(r => ({
    hour: r.hour,
    trNorm: normaliseValue(r.totalReturnNum, trMM, true),
    ddNorm: normaliseValue(r.maxDrawdownNum, ddMM, false),
    sortinoNorm: normaliseValue(r.sortinoNum, sortMM, true),
  }));
}

/**
 * Combine multiple assets' per-hour normalised TR / MDD / Sortino values into
 * a single per-hour row containing:
 *  - combinedTr, combinedDd, combinedSort: SUM of that metric's normalised
 *    value across all assets (range 0..N for N assets).
 *  - grandTotal: sum of all three combined metrics (range 0..3N).
 *  - grandAverage: grandTotal / (3 * N) (range 0..1).
 *
 * An hour is only included if every asset has finite normalised values for
 * every metric, so that the aggregated bars are directly comparable.
 */
function combineNormalizedAllMetrics(resultSets) {
  if (!resultSets || resultSets.some(r => !r || r.length === 0)) return null;
  const normSets = resultSets.map(buildNormalizedRows);
  if (normSets.some(s => !s)) return null;

  const required = normSets.length;
  const byHour = new Map();
  for (const set of normSets) {
    for (const row of set) {
      const e = byHour.get(row.hour) ?? {
        hour: row.hour,
        count: 0,
        tr: 0, dd: 0, sort: 0,
        trN: 0, ddN: 0, sortN: 0,
      };
      e.count += 1;
      if (row.trNorm !== null) { e.tr += row.trNorm; e.trN += 1; }
      if (row.ddNorm !== null) { e.dd += row.ddNorm; e.ddN += 1; }
      if (row.sortinoNorm !== null) { e.sort += row.sortinoNorm; e.sortN += 1; }
      byHour.set(row.hour, e);
    }
  }

  const out = [];
  for (const e of byHour.values()) {
    if (e.count !== required) continue;
    if (e.trN !== required || e.ddN !== required || e.sortN !== required) continue;
    const grandTotal = e.tr + e.dd + e.sort;
    const grandAverage = grandTotal / (3 * required);
    out.push({
      hour: e.hour,
      combinedTr: e.tr,
      combinedDd: e.dd,
      combinedSort: e.sort,
      grandTotal,
      grandAverage,
      assetCount: required,
    });
  }
  out.sort((a, b) => a.hour - b.hour);
  return out;
}

function combineResultsByHour(resultSets) {
  if (!resultSets || resultSets.some(r => !r || r.length === 0)) return null;
  const normalizedMaps = resultSets.map(normalizeTotalReturns);
  if (normalizedMaps.some(m => !m || m.size === 0)) return null;

  const required = normalizedMaps.length;
  const allHours = new Set();
  for (const m of normalizedMaps) {
    for (const h of m.keys()) allHours.add(h);
  }

  const combined = [];
  for (const hour of allHours) {
    const components = [];
    for (const m of normalizedMaps) {
      const v = m.get(hour);
      if (v === undefined) break;
      components.push(v);
    }
    if (components.length !== required) continue;
    const score = components.reduce((s, v) => s + v, 0);
    combined.push({
      hour,
      score,
      scoreStr: score.toFixed(3),
      components,
    });
  }

  combined.sort((a, b) => a.hour - b.hour);
  return combined;
}

function CombinedScoreBarChart({ combined }) {
  if (!combined || combined.length === 0) return null;

  const width = 760;
  const height = 340;
  const padLeft = 64;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 56;
  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;

  const scores = combined.map(r => r.score).filter(v => isFinite(v));
  if (scores.length === 0) return null;

  const minV = 0;
  const maxV = Math.max(3, Math.max(...scores) * 1.05);

  const yScale = v => padTop + chartHeight * (1 - (v - minV) / (maxV - minV));
  const colWidth = chartWidth / 24;
  const barWidth = colWidth * 0.68;
  const xCenter = i => padLeft + colWidth * (i + 0.5);
  const zeroY = yScale(0);

  const tickCount = 5;
  const ticks = [];
  for (let i = 0; i <= tickCount; i++) {
    ticks.push(minV + (maxV - minV) * (i / tickCount));
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', maxHeight: 380, background: '#1c2128', borderRadius: 8 }}
    >
      {ticks.map((v, idx) => {
        const y = yScale(v);
        return (
          <g key={idx}>
            <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="#30363d" strokeWidth={1} />
            <text x={padLeft - 8} y={y + 4} textAnchor="end" fill="#8b949e" fontSize={11}>
              {v.toFixed(2)}
            </text>
          </g>
        );
      })}

      {combined.map(r => {
        const v = r.score;
        if (!isFinite(v)) return null;
        const x = xCenter(r.hour) - barWidth / 2;
        const yTop = yScale(v);
        const h = Math.max(1, zeroY - yTop);
        return (
          <rect key={r.hour} x={x} y={yTop} width={barWidth} height={h} fill="#22d3ee" rx={2}>
            <title>{`${String(r.hour).padStart(2, '0')}:00 UTC — score ${r.scoreStr}`}</title>
          </rect>
        );
      })}

      {Array.from({ length: 24 }, (_, hour) => (
        <text
          key={hour}
          x={xCenter(hour)}
          y={height - padBottom + 16}
          textAnchor="middle"
          fill="#8b949e"
          fontSize={10}
        >
          {String(hour).padStart(2, '0')}
        </text>
      ))}

      <line x1={padLeft} y1={padTop} x2={padLeft} y2={height - padBottom} stroke="#30363d" strokeWidth={1} />
      <line
        x1={padLeft}
        y1={height - padBottom}
        x2={width - padRight}
        y2={height - padBottom}
        stroke="#30363d"
        strokeWidth={1}
      />

      <text
        x={(padLeft + width - padRight) / 2}
        y={height - 12}
        textAnchor="middle"
        fill="#c9d1d9"
        fontSize={12}
      >
        Bar Close (UTC)
      </text>

      <text
        x={16}
        y={(padTop + height - padBottom) / 2}
        textAnchor="middle"
        fill="#c9d1d9"
        fontSize={12}
        transform={`rotate(-90, 16, ${(padTop + height - padBottom) / 2})`}
      >
        Combined normalized score
      </text>
    </svg>
  );
}

/**
 * Grouped bar chart for the combined three-metric view across all assets.
 * For each UTC hour, three coloured bars sit side-by-side showing the SUM of
 * the normalised metric across BTC + ETH + SOL:
 *   - Combined Total Return (range 0..assetCount)
 *   - Combined Max Drawdown — inverted (range 0..assetCount)
 *   - Combined Sortino Ratio (range 0..assetCount)
 */
function CombinedThreeSeriesBarChart({ data }) {
  if (!data || data.length === 0) return null;

  const assetCount = data[0].assetCount || 1;
  const yMax = assetCount;

  const width = 760;
  const height = 360;
  const padLeft = 64;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 72;
  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;

  const yScale = v => padTop + chartHeight * (1 - v / yMax);
  const colWidth = chartWidth / 24;
  const groupWidth = colWidth * 0.84;
  const barWidth = groupWidth / 3;
  const xLeft = i => padLeft + colWidth * i + (colWidth - groupWidth) / 2;
  const zeroY = yScale(0);

  const tickCount = assetCount;
  const ticks = [];
  for (let i = 0; i <= tickCount; i++) {
    ticks.push((yMax * i) / tickCount);
  }

  const series = [
    { key: 'combinedTr', label: 'Combined Total Return (norm sum)', color: '#3fb950' },
    { key: 'combinedDd', label: 'Combined Max Drawdown (norm sum, inverted)', color: '#d29922' },
    { key: 'combinedSort', label: 'Combined Sortino Ratio (norm sum)', color: '#22d3ee' },
  ];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', maxHeight: 400, background: '#1c2128', borderRadius: 8 }}
    >
      {ticks.map((v, idx) => {
        const y = yScale(v);
        return (
          <g key={idx}>
            <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="#30363d" strokeWidth={1} />
            <text x={padLeft - 8} y={y + 4} textAnchor="end" fill="#8b949e" fontSize={11}>
              {v.toFixed(2)}
            </text>
          </g>
        );
      })}

      {data.map(r => (
        <g key={r.hour}>
          {series.map((s, sIdx) => {
            const v = r[s.key];
            if (!isFinite(v)) return null;
            const x = xLeft(r.hour) + sIdx * barWidth;
            const yTop = yScale(v);
            const h = Math.max(1, zeroY - yTop);
            return (
              <rect
                key={`${r.hour}-${s.key}`}
                x={x}
                y={yTop}
                width={Math.max(1, barWidth - 1)}
                height={h}
                fill={s.color}
                rx={1.5}
              >
                <title>{`${String(r.hour).padStart(2, '0')}:00 UTC — ${s.label}: ${v.toFixed(3)} / ${assetCount.toFixed(0)}`}</title>
              </rect>
            );
          })}
        </g>
      ))}

      {Array.from({ length: 24 }, (_, hour) => (
        <text
          key={hour}
          x={padLeft + colWidth * (hour + 0.5)}
          y={height - padBottom + 16}
          textAnchor="middle"
          fill="#8b949e"
          fontSize={10}
        >
          {String(hour).padStart(2, '0')}
        </text>
      ))}

      <line x1={padLeft} y1={padTop} x2={padLeft} y2={height - padBottom} stroke="#30363d" strokeWidth={1} />
      <line
        x1={padLeft}
        y1={height - padBottom}
        x2={width - padRight}
        y2={height - padBottom}
        stroke="#30363d"
        strokeWidth={1}
      />

      <text
        x={(padLeft + width - padRight) / 2}
        y={height - 44}
        textAnchor="middle"
        fill="#c9d1d9"
        fontSize={12}
      >
        Bar Close (UTC)
      </text>

      <text
        x={16}
        y={(padTop + height - padBottom) / 2}
        textAnchor="middle"
        fill="#c9d1d9"
        fontSize={12}
        transform={`rotate(-90, 16, ${(padTop + height - padBottom) / 2})`}
      >
        {`Sum of normalised value (0–${assetCount})`}
      </text>

      {series.map((s, idx) => {
        const x = padLeft + idx * 240;
        const y = height - 14;
        return (
          <g key={`legend-${s.key}`}>
            <rect x={x} y={y - 8} width={10} height={10} fill={s.color} rx={1} />
            <text x={x + 16} y={y + 1} fill="#c9d1d9" fontSize={11}>{s.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Single-bar-per-hour chart showing the grand total of all normalised
 * metrics (Total Return + inverted Max Drawdown + Sortino) summed across
 * every asset. With 3 assets × 3 metrics the score ranges from 0 to 9.
 *
 * Also supports an "average" mode where the value is grandTotal / (3 * assets)
 * (range 0..1), used for the final 0–1 summary chart.
 */
function GrandScoreBarChart({ data, valueKey, yMax, yLabel, format, color = '#a371f7' }) {
  if (!data || data.length === 0) return null;

  const width = 760;
  const height = 340;
  const padLeft = 72;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 56;
  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;

  const yScale = v => padTop + chartHeight * (1 - v / yMax);
  const colWidth = chartWidth / 24;
  const barWidth = colWidth * 0.68;
  const xCenter = i => padLeft + colWidth * (i + 0.5);
  const zeroY = yScale(0);

  const tickCount = 6;
  const ticks = [];
  for (let i = 0; i <= tickCount; i++) {
    ticks.push((yMax * i) / tickCount);
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', maxHeight: 380, background: '#1c2128', borderRadius: 8 }}
    >
      {ticks.map((v, idx) => {
        const y = yScale(v);
        return (
          <g key={idx}>
            <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="#30363d" strokeWidth={1} />
            <text x={padLeft - 8} y={y + 4} textAnchor="end" fill="#8b949e" fontSize={11}>
              {format(v)}
            </text>
          </g>
        );
      })}

      {data.map(r => {
        const v = r[valueKey];
        if (!isFinite(v)) return null;
        const x = xCenter(r.hour) - barWidth / 2;
        const yTop = yScale(v);
        const h = Math.max(1, zeroY - yTop);
        return (
          <rect key={r.hour} x={x} y={yTop} width={barWidth} height={h} fill={color} rx={2}>
            <title>{`${String(r.hour).padStart(2, '0')}:00 UTC — ${format(v)}`}</title>
          </rect>
        );
      })}

      {Array.from({ length: 24 }, (_, hour) => (
        <text
          key={hour}
          x={xCenter(hour)}
          y={height - padBottom + 16}
          textAnchor="middle"
          fill="#8b949e"
          fontSize={10}
        >
          {String(hour).padStart(2, '0')}
        </text>
      ))}

      <line x1={padLeft} y1={padTop} x2={padLeft} y2={height - padBottom} stroke="#30363d" strokeWidth={1} />
      <line
        x1={padLeft}
        y1={height - padBottom}
        x2={width - padRight}
        y2={height - padBottom}
        stroke="#30363d"
        strokeWidth={1}
      />

      <text
        x={(padLeft + width - padRight) / 2}
        y={height - 12}
        textAnchor="middle"
        fill="#c9d1d9"
        fontSize={12}
      >
        Bar Close (UTC)
      </text>

      <text
        x={16}
        y={(padTop + height - padBottom) / 2}
        textAnchor="middle"
        fill="#c9d1d9"
        fontSize={12}
        transform={`rotate(-90, 16, ${(padTop + height - padBottom) / 2})`}
      >
        {yLabel}
      </text>
    </svg>
  );
}

function CombinedSummaryRow({ label, combined }) {
  if (!combined || combined.length === 0) {
    return (
      <li style={{ marginBottom: 16 }}>
        <strong>{label}:</strong> waiting for hourly data to load…
      </li>
    );
  }

  const bestOverall = bestBy(combined, r => r.score, true);
  const bestWindow = bestBy(combined, r => r.score, true, WINDOW_HOUR_FILTER);

  return (
    <li style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <ul style={{ paddingLeft: 18, margin: 0 }}>
        <li>
          Best <strong>combined score</strong> overall:{' '}
          <strong>{bestOverall ? formatHour(bestOverall.hour) : '—'}</strong>
          {bestOverall ? ` (score ${bestOverall.scoreStr})` : ''}
          {' · '}within {WINDOW_LABEL}:{' '}
          <strong>{bestWindow ? formatHour(bestWindow.hour) : '—'}</strong>
          {bestWindow ? ` (score ${bestWindow.scoreStr})` : ''}
        </li>
      </ul>
    </li>
  );
}

function RobustnessLine({ label, results, accessor, higherIsBetter = true, metricFormat }) {
  const c = classifyHourRobustness(results, accessor, higherIsBetter);
  const verdict = robustnessVerdict(c);

  if (!c) {
    return (
      <li>
        <strong>{label}:</strong> not enough data to classify.
      </li>
    );
  }

  const bestRow = results.find(r => r.hour === c.bestHour);
  const leftRow = results.find(r => r.hour === c.leftHour);
  const rightRow = results.find(r => r.hour === c.rightHour);

  const fmt = (row, rank) => {
    if (!row) return `${formatHour(rank === 'left' ? c.leftHour : c.rightHour)} (—)`;
    const v = accessor(row);
    const rk = rank === 'left' ? c.leftRank : c.rightRank;
    return `${formatHour(row.hour)} (${metricFormat(v)}, rank ${rk}/${c.total})`;
  };

  return (
    <li style={{ marginBottom: 6 }}>
      <strong>{label}:</strong>{' '}
      <span style={{ color: verdict.color, fontWeight: 600 }}>{verdict.label}</span>
      {' — '}
      best {formatHour(c.bestHour)} ({metricFormat(accessor(bestRow))}); neighbours{' '}
      {fmt(leftRow, 'left')} and {fmt(rightRow, 'right')}.
      <div className="helper-text" style={{ marginTop: 2 }}>{verdict.note}</div>
    </li>
  );
}

function RobustnessSummaryRow({ btcResults, ethResults, solResults, combined }) {
  const ready = (btcResults && btcResults.length > 0)
    || (ethResults && ethResults.length > 0)
    || (solResults && solResults.length > 0)
    || (combined && combined.length > 0);

  if (!ready) {
    return (
      <li style={{ marginBottom: 16 }}>
        <strong>Robustness check:</strong> waiting for hourly data to load…
      </li>
    );
  }

  return (
    <li style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        Robustness check — is the best hour a cluster or an isolated spike?
      </div>
      <div className="helper-text" style={{ marginBottom: 8 }}>
        For each result set, the two UTC hours adjacent to the best hour are looked up on the 24-hour ring. If both adjacent hours also rank in the top third, the best hour sits inside a coherent peak (likely a real effect). If neither does, it is an isolated spike that is most likely statistical noise.
      </div>
      <ul style={{ paddingLeft: 18, margin: 0 }}>
        <RobustnessLine
          label="MTTI-BTC — Total Return"
          results={btcResults}
          accessor={r => r.totalReturnNum}
          metricFormat={v => `${v.toFixed(2)}%`}
        />
        <RobustnessLine
          label="MTTI-others (ETH) — Total Return"
          results={ethResults}
          accessor={r => r.totalReturnNum}
          metricFormat={v => `${v.toFixed(2)}%`}
        />
        <RobustnessLine
          label="MTTI-others (SOL) — Total Return"
          results={solResults}
          accessor={r => r.totalReturnNum}
          metricFormat={v => `${v.toFixed(2)}%`}
        />
        <RobustnessLine
          label="Combined (BTC + ETH + SOL, normalized score)"
          results={combined}
          accessor={r => r.score}
          metricFormat={v => v.toFixed(3)}
        />
      </ul>
    </li>
  );
}

function StrategySummaryRow({ label, results }) {
  if (!results || results.length === 0) {
    return (
      <li style={{ marginBottom: 12 }}>
        <strong>{label}:</strong> waiting for hourly data to load…
      </li>
    );
  }

  const bestReturnOverall = bestBy(results, r => r.totalReturnNum, true);
  const bestReturnWindow = bestBy(results, r => r.totalReturnNum, true, WINDOW_HOUR_FILTER);
  const bestSortinoOverall = bestBy(results, r => r.sortinoNum, true);
  const bestSortinoWindow = bestBy(results, r => r.sortinoNum, true, WINDOW_HOUR_FILTER);
  const bestDrawdownOverall = bestBy(results, r => r.maxDrawdownNum, false);
  const bestDrawdownWindow = bestBy(results, r => r.maxDrawdownNum, false, WINDOW_HOUR_FILTER);

  const tradeCounts = results
    .map(r => r.totalTrades)
    .filter(n => typeof n === 'number' && isFinite(n));
  const minTrades = tradeCounts.length ? Math.min(...tradeCounts) : null;
  const maxTrades = tradeCounts.length ? Math.max(...tradeCounts) : null;
  const meanTrades = tradeCounts.length
    ? (tradeCounts.reduce((s, n) => s + n, 0) / tradeCounts.length)
    : null;

  return (
    <li style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <ul style={{ paddingLeft: 18, margin: 0 }}>
        <li>
          Best <strong>Total Return</strong> overall:{' '}
          <strong>{bestReturnOverall ? formatHour(bestReturnOverall.hour) : '—'}</strong>
          {bestReturnOverall
            ? ` (${bestReturnOverall.totalReturn}%, ${bestReturnOverall.totalTrades} trades)`
            : ''}
          {' · '}within {WINDOW_LABEL}:{' '}
          <strong>{bestReturnWindow ? formatHour(bestReturnWindow.hour) : '—'}</strong>
          {bestReturnWindow
            ? ` (${bestReturnWindow.totalReturn}%, ${bestReturnWindow.totalTrades} trades)`
            : ''}
        </li>
        {minTrades !== null && (
          <li>
            <strong>Trade count</strong> across all 24 variants: min {minTrades}, mean{' '}
            {meanTrades.toFixed(1)}, max {maxTrades}.
          </li>
        )}
        <li>
          Best <strong>Sortino Ratio</strong> overall:{' '}
          <strong>{bestSortinoOverall ? formatHour(bestSortinoOverall.hour) : '—'}</strong>
          {bestSortinoOverall ? ` (${bestSortinoOverall.sortino})` : ''}
          {' · '}within {WINDOW_LABEL}:{' '}
          <strong>{bestSortinoWindow ? formatHour(bestSortinoWindow.hour) : '—'}</strong>
          {bestSortinoWindow ? ` (${bestSortinoWindow.sortino})` : ''}
        </li>
        <li>
          Lowest <strong>Max Drawdown</strong> overall:{' '}
          <strong>{bestDrawdownOverall ? formatHour(bestDrawdownOverall.hour) : '—'}</strong>
          {bestDrawdownOverall ? ` (${bestDrawdownOverall.maxDrawdown}%)` : ''}
          {' · '}within {WINDOW_LABEL}:{' '}
          <strong>{bestDrawdownWindow ? formatHour(bestDrawdownWindow.hour) : '—'}</strong>
          {bestDrawdownWindow ? ` (${bestDrawdownWindow.maxDrawdown}%)` : ''}
        </li>
      </ul>
    </li>
  );
}

export default function SandboxPage() {
  const [btcResults, setBtcResults] = useState(null);
  const [ethResults, setEthResults] = useState(null);
  const [solResults, setSolResults] = useState(null);
  const [selectedPreset, setSelectedPreset] = useState(SANDBOX_DEFAULT_BACKTEST_DATE);
  const [customDate, setCustomDate] = useState(SANDBOX_DEFAULT_BACKTEST_DATE);

  const activeDateStr = selectedPreset === 'custom' ? customDate : selectedPreset;
  const backtestStart = useMemo(
    () => new Date(`${activeDateStr}T00:00:00Z`).getTime(),
    [activeDateStr],
  );
  const backtestLabel = useMemo(() => formatDateLabel(activeDateStr), [activeDateStr]);

  const onBtcResults = useCallback(r => setBtcResults(r), []);
  const onEthResults = useCallback(r => setEthResults(r), []);
  const onSolResults = useCallback(r => setSolResults(r), []);

  const combinedResults = useMemo(
    () => combineResultsByHour([btcResults, ethResults, solResults]),
    [btcResults, ethResults, solResults],
  );

  const combinedAllMetrics = useMemo(
    () => combineNormalizedAllMetrics([btcResults, ethResults, solResults]),
    [btcResults, ethResults, solResults],
  );

  function handlePresetChange(e) {
    const val = e.target.value;
    setSelectedPreset(val);
    if (val !== 'custom') {
      setCustomDate(val);
    }
  }

  return (
    <div>
      <div className="section">
        <h3 className="section-title">Sandbox controls</h3>
        <div className="controls-row" style={{ marginBottom: 0 }}>
          <label className="control-label">Backtest from:</label>
          <select
            value={selectedPreset}
            onChange={handlePresetChange}
            className="control-input"
          >
            {SANDBOX_BACKTEST_DATE_PRESETS.map(p => (
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
        <div className="helper-text" style={{ marginTop: 8 }}>
          Changing this date re-runs every backtest below — the BTC, ETH, and SOL hourly tables and charts, the summary, the combined score chart, and the final grand-total / grand-average charts all update.
        </div>
      </div>

      <BarCloseStrategySection
        title="Custom bar close strategy performance"
        symbol="BTCUSDT"
        assetLabel="BTC"
        strategyName="MTTI-BTC"
        strategyParams={MTTI_BTC_PARAMS}
        backtestStart={backtestStart}
        backtestLabel={backtestLabel}
        onResults={onBtcResults}
      />
      <BarCloseStrategySection
        title="Custom bar close strategy performance — ETH"
        symbol="ETHUSDT"
        assetLabel="ETH"
        strategyName="MTTI-others"
        strategyParams={MTTI_OTHERS_PARAMS}
        backtestStart={backtestStart}
        backtestLabel={backtestLabel}
        onResults={onEthResults}
      />
      <BarCloseStrategySection
        title="Custom bar close strategy performance — SOL"
        symbol="SOLUSDT"
        assetLabel="SOL"
        strategyName="MTTI-others"
        strategyParams={MTTI_OTHERS_PARAMS}
        backtestStart={backtestStart}
        backtestLabel={backtestLabel}
        onResults={onSolResults}
      />

      <div className="section">
        <h3 className="section-title">Summary — best UTC hour to take signals</h3>
        <div className="helper-text" style={{ marginBottom: 8 }}>
          Based on the backtests above (<strong>{backtestLabel}</strong> to present). The constrained window <strong>{WINDOW_LABEL}</strong> only considers bar-close hours that fall within that period, so the eligible hours are <strong>05:00 through 22:00 UTC</strong> (the 23:00 close is excluded because it falls after 22:30).
        </div>
        <div className="helper-text" style={{ marginBottom: 8 }}>
          Total Return is the most direct measure of profitability, Sortino is risk-adjusted return, and Max Drawdown captures the worst peak-to-trough loss. These three metrics often disagree — pick whichever matches how you want to evaluate the strategy.
        </div>
        <div className="helper-text" style={{ marginBottom: 12 }}>
          The <strong>Combined score</strong> is computed by min-max normalizing each strategy's 24-hour Total Return curve into the range 0 (worst hour for that strategy) to 1 (best hour for that strategy), then summing the normalized values across the three strategies for each UTC hour. With three strategies the score ranges from 0.000 to 3.000 and has no units — it is purely a relative ranking.
        </div>

        <ul style={{ paddingLeft: 20, color: 'var(--text-primary)', listStyle: 'none' }}>
          <StrategySummaryRow label="MTTI-BTC (BTC)" results={btcResults} />
          <StrategySummaryRow label="MTTI-others (ETH)" results={ethResults} />
          <StrategySummaryRow label="MTTI-others (SOL)" results={solResults} />
          <CombinedSummaryRow
            label="Combined (BTC + ETH + SOL, normalized Total Return score)"
            combined={combinedResults}
          />
          <RobustnessSummaryRow
            btcResults={btcResults}
            ethResults={ethResults}
            solResults={solResults}
            combined={combinedResults}
          />
        </ul>
      </div>

      <div className="section">
        <h3 className="section-title">Combined normalized scores per UTC hour</h3>
        <div className="helper-text" style={{ marginBottom: 12 }}>
          Each asset's 24-hour metric curves are independently min-max normalised to 0–1 and then summed per UTC bar-close hour across BTC + ETH + SOL. The charts appear once all three hourly backtests have finished. <strong>Higher is better in every chart</strong> — Max Drawdown is inverted before summing so that 1 = smallest drawdown for an asset and 0 = largest.
        </div>

        <div style={{ marginTop: 16, marginBottom: 8, color: '#c9d1d9', fontWeight: 600 }}>
          Combined Total Return only (existing view)
        </div>
        <div className="helper-text" style={{ marginBottom: 8 }}>
          BTC + ETH + SOL normalised Total Return summed per hour. Range 0–3.
        </div>
        {combinedResults && combinedResults.length > 0 ? (
          <CombinedScoreBarChart combined={combinedResults} />
        ) : (
          <div className="helper-text">Waiting for BTC, ETH, and SOL hourly backtests to finish…</div>
        )}

        <div style={{ marginTop: 24, marginBottom: 8, color: '#c9d1d9', fontWeight: 600 }}>
          Combined Total Return + Max Drawdown + Sortino (per metric)
        </div>
        <div className="helper-text" style={{ marginBottom: 8 }}>
          Three coloured bars per UTC hour: each is the sum of one normalised metric across BTC + ETH + SOL. Range 0–3 per bar. Useful for seeing whether one hour is good for profitability but bad for drawdown / risk-adjusted return.
        </div>
        {combinedAllMetrics && combinedAllMetrics.length > 0 ? (
          <CombinedThreeSeriesBarChart data={combinedAllMetrics} />
        ) : (
          <div className="helper-text">Waiting for BTC, ETH, and SOL hourly backtests to finish…</div>
        )}
      </div>

      <div className="section">
        <h3 className="section-title">Final grand-total &amp; grand-average score per UTC hour</h3>
        <div className="helper-text" style={{ marginBottom: 8 }}>
          The ultimate single-number ranking. For each UTC bar-close hour we take all three normalised metrics (Total Return, inverted Max Drawdown, Sortino Ratio) from each of the three assets (BTC + ETH + SOL) and combine them into a single per-hour score. <strong>Higher is better</strong> in both charts.
        </div>
        <div className="helper-text" style={{ marginBottom: 12 }}>
          The total chart sums all <strong>3 metrics × 3 assets = 9 normalised values</strong> (range 0–9). The average chart divides that by 9 so the scale is 0–1 — same ranking, friendlier numbers. Max Drawdown is inverted before being aggregated because smaller drawdowns are better.
        </div>

        <div style={{ marginTop: 8, marginBottom: 8, color: '#c9d1d9', fontWeight: 600 }}>
          Grand total per hour (range 0–9)
        </div>
        {combinedAllMetrics && combinedAllMetrics.length > 0 ? (
          <GrandScoreBarChart
            data={combinedAllMetrics}
            valueKey="grandTotal"
            yMax={Math.max(9, 3 * (combinedAllMetrics[0].assetCount || 3))}
            yLabel="Grand total of normalised metrics"
            format={v => v.toFixed(2)}
            color="#a371f7"
          />
        ) : (
          <div className="helper-text">Waiting for BTC, ETH, and SOL hourly backtests to finish…</div>
        )}

        <div style={{ marginTop: 24, marginBottom: 8, color: '#c9d1d9', fontWeight: 600 }}>
          Grand average per hour (range 0–1)
        </div>
        {combinedAllMetrics && combinedAllMetrics.length > 0 ? (
          <GrandScoreBarChart
            data={combinedAllMetrics}
            valueKey="grandAverage"
            yMax={1}
            yLabel="Grand average of normalised metrics"
            format={v => v.toFixed(2)}
            color="#f778ba"
          />
        ) : (
          <div className="helper-text">Waiting for BTC, ETH, and SOL hourly backtests to finish…</div>
        )}
      </div>
    </div>
  );
}
