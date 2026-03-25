import { runBacktest } from './engine.js';
import { MTTI_BTC_PARAMS } from '../strategies/mttiBtcConfig.js';
import { MTTI_OTHERS_PARAMS } from '../strategies/mttiOthersConfig.js';

const ALLOC_BACKTEST_START = new Date('2023-01-01T00:00:00Z').getTime();

const STRATEGY_PARAMS = {
  'MTTI-BTC': MTTI_BTC_PARAMS,
  'MTTI-others': MTTI_OTHERS_PARAMS,
};

function rankDescending(values) {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => b.v - a.v);
  const ranks = new Array(values.length);
  indexed.forEach((item, rank) => { ranks[item.i] = rank + 1; });
  return ranks;
}

function normalizeWeights(weights) {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum === 0) return weights.map(() => 0);
  return weights.map(w => w / sum);
}

function computeWeights(formula, longMask, sortinos, sortinoRanks, domScores, domRanks, n) {
  const raw = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    if (!longMask[i]) continue;

    switch (formula) {
      case 'A': {
        const base = n + 1 - sortinoRanks[i];
        const domAdj = 1 + 0.3 * (n + 1 - 2 * domRanks[i]) / Math.max(n - 1, 1);
        raw[i] = base * Math.max(domAdj, 0.1);
        break;
      }
      case 'B': {
        raw[i] = (n + 1 - sortinoRanks[i]) + (n + 1 - domRanks[i]);
        break;
      }
      case 'C':
      case 'F':
      case 'G':
      case 'H': {
        raw[i] = Math.max(0, isFinite(sortinos[i]) ? sortinos[i] : 0);
        break;
      }
      case 'D': {
        const base = n + 1 - domRanks[i];
        const sortAdj = 1 + 0.3 * (n + 1 - 2 * sortinoRanks[i]) / Math.max(n - 1, 1);
        raw[i] = base * Math.max(sortAdj, 0.1);
        break;
      }
      case 'E': {
        raw[i] = n + 1 - domRanks[i];
        break;
      }
    }
  }

  if (raw.every(w => w === 0) && longMask.some(m => m)) {
    for (let i = 0; i < n; i++) {
      if (longMask[i]) raw[i] = 1;
    }
  }

  return normalizeWeights(raw);
}

function fmtRatio(v) {
  if (isNaN(v)) return '--';
  if (!isFinite(v)) return v > 0 ? 'Inf' : '-Inf';
  return v.toFixed(2);
}

function parseSortino(val) {
  if (val === '--' || val === undefined || val === null) return -Infinity;
  if (val === 'Inf') return Infinity;
  if (val === '-Inf') return -Infinity;
  const num = parseFloat(val);
  return isNaN(num) ? -Infinity : num;
}

function formulaLabel(f) {
  switch (f) {
    case 'A': return 'Assets ranked by Sortino. Higher rank = more allocation. Dominance adjusts each weight by up to ±30%.';
    case 'B': return 'Sortino rank and Dominance rank contribute equally. Combined rank determines allocation weight.';
    case 'C': return 'Each LONG asset gets allocation directly proportional to its raw Sortino value. Higher Sortino = more capital.';
    case 'D': return 'Assets ranked by Dominance. Higher rank = more allocation. Sortino adjusts each weight by up to ±30%.';
    case 'E': return 'Allocation based purely on Dominance rank. Ignores Sortino entirely.';
    case 'F': return 'Same as Formula C, but the entire portfolio goes to cash whenever BTC MTTI-1D signal is CASH.';
    case 'G': return 'Same as Formula C, but the entire portfolio goes to cash whenever BTC LTTI-3D signal is CASH.';
    case 'H': return 'When LTTI is LONG: allocate like Formula C across all assets. When LTTI is CASH: only BTC MTTI-1D is allowed to trade.';
    default: return f;
  }
}

/**
 * @param {string} formula
 * @param {Array} overrideSignals - optional sorted {time,signal}[] for F/G global cash override
 * @param {Object} [opts] - extra options
 * @param {Array}  [opts.btcOnlyOverride] - sorted {time,signal}[]; when CASH, only btcMttiIdx is allowed
 * @param {number} [opts.btcMttiIdx] - index of BTC MTTI in mttiAssets
 */
function runSingleFormula(formula, timeline, closeMaps, mttiAssets, sortinos, sortinoRanks, domScores, domRanks, n, overrideSignals, opts) {
  const INITIAL_CAPITAL = 1000;
  let portfolioValue = INITIAL_CAPITAL;
  const tradePnls = [];
  const tradeDetails = [];
  const equity = [];
  const barAllocations = [];
  let inTrade = false;
  let tradeEntryValue = 0;
  let tradeEntryTime = 0;
  let peakEquity = INITIAL_CAPITAL;
  let maxDrawdown = 0;

  let overridePtr = 0;
  let currentOverrideSignal = 'CASH';

  const btcOnly = opts?.btcOnlyOverride;
  const btcIdx = opts?.btcMttiIdx ?? -1;
  let btcOnlyPtr = 0;
  let currentBtcOnlySignal = 'CASH';

  for (let t = 0; t < timeline.length; t++) {
    const currTime = timeline[t];

    if (overrideSignals) {
      while (overridePtr < overrideSignals.length && overrideSignals[overridePtr].time <= currTime) {
        currentOverrideSignal = overrideSignals[overridePtr].signal;
        overridePtr++;
      }
    }

    if (btcOnly) {
      while (btcOnlyPtr < btcOnly.length && btcOnly[btcOnlyPtr].time <= currTime) {
        currentBtcOnlySignal = btcOnly[btcOnlyPtr].signal;
        btcOnlyPtr++;
      }
    }

    let longMask = mttiAssets.map((_, i) => {
      if (!closeMaps[i].has(currTime)) return false;
      return closeMaps[i].get(currTime).signal === 'LONG';
    });

    if (overrideSignals && currentOverrideSignal !== 'LONG') {
      longMask = longMask.map(() => false);
    }

    if (btcOnly && currentBtcOnlySignal !== 'LONG') {
      longMask = longMask.map((m, i) => i === btcIdx ? m : false);
    }

    const anyLong = longMask.some(m => m);

    if (t > 0) {
      const prevTime = timeline[t - 1];
      const assetReturns = mttiAssets.map((_, i) => {
        const prev = closeMaps[i].get(prevTime);
        const curr = closeMaps[i].get(currTime);
        if (!prev || !curr || prev.close === 0) return 0;
        return (curr.close - prev.close) / prev.close;
      });

      let prevLongMask = mttiAssets.map((_, i) => {
        if (!closeMaps[i].has(prevTime)) return false;
        return closeMaps[i].get(prevTime).signal === 'LONG';
      });

      if (overrideSignals) {
        let prevOverrideSignal = 'CASH';
        for (let k = 0; k < overrideSignals.length; k++) {
          if (overrideSignals[k].time > prevTime) break;
          prevOverrideSignal = overrideSignals[k].signal;
        }
        if (prevOverrideSignal !== 'LONG') {
          prevLongMask = prevLongMask.map(() => false);
        }
      }

      if (btcOnly) {
        let prevBtcOnlySignal = 'CASH';
        for (let k = 0; k < btcOnly.length; k++) {
          if (btcOnly[k].time > prevTime) break;
          prevBtcOnlySignal = btcOnly[k].signal;
        }
        if (prevBtcOnlySignal !== 'LONG') {
          prevLongMask = prevLongMask.map((m, i) => i === btcIdx ? m : false);
        }
      }

      const weights = computeWeights(formula, prevLongMask, sortinos, sortinoRanks, domScores, domRanks, n);

      let portfolioReturn = 0;
      for (let i = 0; i < n; i++) {
        portfolioReturn += weights[i] * assetReturns[i];
      }

      portfolioValue *= (1 + portfolioReturn);
    }

    if (portfolioValue > peakEquity) peakEquity = portfolioValue;
    const dd = (peakEquity - portfolioValue) / peakEquity;
    if (dd > maxDrawdown) maxDrawdown = dd;

    const currentWeights = computeWeights(formula, longMask, sortinos, sortinoRanks, domScores, domRanks, n);
    const allocMap = {};
    for (let i = 0; i < n; i++) {
      allocMap[mttiAssets[i].config.name] = currentWeights[i] * 100;
    }

    equity.push({ time: currTime, value: portfolioValue });
    barAllocations.push({ time: currTime, weights: allocMap });

    if (anyLong && !inTrade) {
      inTrade = true;
      tradeEntryValue = portfolioValue;
      tradeEntryTime = currTime;
    } else if (!anyLong && inTrade) {
      const pnlPct = (portfolioValue - tradeEntryValue) / tradeEntryValue;
      tradePnls.push(pnlPct);
      tradeDetails.push({
        entryTime: tradeEntryTime,
        exitTime: currTime,
        pnlPct: pnlPct * 100,
        pnl: portfolioValue - tradeEntryValue,
      });
      inTrade = false;
    }
  }

  if (inTrade) {
    const pnlPct = (portfolioValue - tradeEntryValue) / tradeEntryValue;
    tradePnls.push(pnlPct);
    tradeDetails.push({
      entryTime: tradeEntryTime,
      exitTime: timeline[timeline.length - 1],
      pnlPct: pnlPct * 100,
      pnl: portfolioValue - tradeEntryValue,
    });
  }

  const finalEquity = equity.length > 0 ? equity[equity.length - 1].value : INITIAL_CAPITAL;
  const totalReturn = ((finalEquity - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;
  const wins = tradeDetails.filter(t => t.pnlPct > 0).length;
  const losses = tradeDetails.filter(t => t.pnlPct <= 0).length;
  const winRate = tradeDetails.length > 0 ? (wins / tradeDetails.length) * 100 : 0;

  const grossProfit = tradeDetails.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(tradeDetails.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  let sharpe = NaN;
  let sortino = NaN;
  let omega = NaN;

  if (tradePnls.length >= 2) {
    const mean = tradePnls.reduce((s, v) => s + v, 0) / tradePnls.length;
    const variance = tradePnls.reduce((s, v) => s + (v - mean) ** 2, 0) / (tradePnls.length - 1);
    const std = Math.sqrt(variance);
    sharpe = std > 0 ? mean / std : 0;

    const downsideDev = Math.sqrt(
      tradePnls.reduce((s, r) => s + (r < 0 ? r * r : 0), 0) / tradePnls.length
    );
    sortino = downsideDev > 0 ? mean / downsideDev : (mean > 0 ? Infinity : 0);

    let gains = 0;
    let lossSum = 0;
    for (const r of tradePnls) {
      if (r > 0) gains += r;
      else lossSum += -r;
    }
    omega = lossSum > 0 ? 1 + gains / lossSum : (gains > 0 ? Infinity : 1);
  }

  const stats = {
    initialCapital: INITIAL_CAPITAL,
    finalEquity: finalEquity.toFixed(2),
    totalReturn: totalReturn.toFixed(2),
    buyHoldReturn: '--',
    totalTrades: tradeDetails.length,
    wins,
    losses,
    winRate: winRate.toFixed(1),
    maxDrawdown: (maxDrawdown * 100).toFixed(2),
    profitFactor: profitFactor === Infinity ? 'Inf' : profitFactor.toFixed(2),
    sharpe: fmtRatio(sharpe),
    sortino: fmtRatio(sortino),
    omega: fmtRatio(omega),
  };

  return {
    totalReturn: totalReturn.toFixed(2),
    sortino: fmtRatio(sortino),
    sortinoRaw: sortino,
    equity,
    trades: tradeDetails,
    barAllocations,
    stats,
  };
}

/**
 * Run full allocation analysis: compare 5 formulas, find best,
 * return asset table + equity curve + per-bar allocations.
 */
export function runAllocationAnalysis(mttiAssets, dominance, backtestStart = ALLOC_BACKTEST_START, lttiAsset = null) {
  const n = mttiAssets.length;
  if (n === 0) return null;

  const assetBacktests = mttiAssets.map(a => {
    const params = STRATEGY_PARAMS[a.config.strategy];
    if (!params) return null;
    return runBacktest(a.candles, a.compositeScores, params.longThresh, params.shortThresh, backtestStart);
  });

  const sortinos = assetBacktests.map(b => parseSortino(b?.stats?.sortino));
  const sortinoRanks = rankDescending(sortinos.map(s => isFinite(s) ? s : -1e9));

  const domScores = mttiAssets.map(a => {
    const d = dominance?.[a.config.name];
    return d ? d.wins - d.losses : 0;
  });
  const domRanks = rankDescending(domScores);

  const closeMaps = mttiAssets.map(a => {
    const map = new Map();
    for (let i = 0; i < a.candles.length; i++) {
      map.set(a.candles[i].time, { close: a.candles[i].close, signal: a.signals[i] });
    }
    return map;
  });

  const allTimes = new Set();
  for (const m of closeMaps) {
    for (const t of m.keys()) {
      if (t >= backtestStart) allTimes.add(t);
    }
  }
  const timeline = [...allTimes].sort((a, b) => a - b);

  if (timeline.length < 2) return null;

  const btcMttiIdx = mttiAssets.findIndex(a => a.config.strategy === 'MTTI-BTC');
  const btcMttiOverride = btcMttiIdx >= 0
    ? mttiAssets[btcMttiIdx].candles.map((c, i) => ({ time: c.time, signal: mttiAssets[btcMttiIdx].signals[i] }))
    : null;

  const lttiOverride = lttiAsset
    ? lttiAsset.candles.map((c, i) => ({ time: c.time, signal: lttiAsset.signals[i] }))
    : null;

  const formulas = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const formulaResults = formulas.map(f => {
    let override = null;
    let opts = undefined;
    if (f === 'F') override = btcMttiOverride;
    if (f === 'G') override = lttiOverride;
    if (f === 'H') {
      opts = { btcOnlyOverride: lttiOverride, btcMttiIdx: btcMttiIdx >= 0 ? btcMttiIdx : undefined };
    }
    const result = runSingleFormula(f, timeline, closeMaps, mttiAssets, sortinos, sortinoRanks, domScores, domRanks, n, override, opts);
    return { formula: f, label: formulaLabel(f), ...result };
  });

  let bestIdx = 0;
  for (let i = 1; i < formulaResults.length; i++) {
    const curr = parseSortino(formulaResults[i].stats.omega);
    const best = parseSortino(formulaResults[bestIdx].stats.omega);
    if (curr > best) bestIdx = i;
  }

  const assetNames = mttiAssets.map(a => a.config.name);

  const formulaDetailsMap = {};
  for (const r of formulaResults) {
    const lastAlloc = r.barAllocations[r.barAllocations.length - 1];
    formulaDetailsMap[r.formula] = {
      equity: r.equity,
      barAllocations: r.barAllocations,
      stats: r.stats,
      assetTable: mttiAssets.map((a, i) => {
        const lastSignal = a.signals[a.signals.length - 1];
        return {
          name: a.config.name,
          label: a.config.label,
          sortino: assetBacktests[i]?.stats?.sortino ?? '--',
          sortinoRaw: sortinos[i],
          signal: lastSignal,
          domScore: domScores[i],
          allocation: lastAlloc?.weights?.[a.config.name] ?? 0,
        };
      }).sort((a, b) => b.sortinoRaw - a.sortinoRaw),
    };
  }

  return {
    comparison: formulaResults.map(r => ({
      formula: r.formula,
      label: r.label,
      totalReturn: r.totalReturn,
      maxDrawdown: r.stats.maxDrawdown,
      sortino: r.sortino,
      omega: r.stats.omega,
    })),
    bestFormulaKey: formulaResults[bestIdx].formula,
    formulaDetails: formulaDetailsMap,
    assetNames,
  };
}
