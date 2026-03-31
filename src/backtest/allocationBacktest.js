import { runBacktest } from './engine.js';
import { MTTI_BTC_PARAMS } from '../strategies/mttiBtcConfig.js';
import { MTTI_OTHERS_PARAMS } from '../strategies/mttiOthersConfig.js';
import { DEFAULT_BACKTEST_START } from '../constants/backtestDates.js';

const STRATEGY_PARAMS = {
  'MTTI-BTC': MTTI_BTC_PARAMS,
  'MTTI-others': MTTI_OTHERS_PARAMS,
};
const KELLY_REFERENCE_START = new Date('2023-01-01T00:00:00Z').getTime();

function rankDescending(values) {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => b.v - a.v);
  const ranks = new Array(values.length);
  indexed.forEach((item, rank) => { ranks[item.i] = rank + 1; });
  return ranks;
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
    case 'A': return 'BTC Buy & Hold (100% BTC).';
    case 'B': return 'When LTTI is LONG, allocate to BTC only when MTTI-BTC is LONG. CASH when LTTI is SHORT.';
    case 'C': return 'When LTTI is LONG, allocate to BTC only when MTTI-BTC is LONG. Full allocation to PAXG instead of CASH when LTTI is SHORT.';
    case 'D': return 'When LTTI is LONG allocate 100% to Dominant Asset (fallback to most dominant LONG asset). CASH when LTTI is SHORT.';
    case 'E': return 'When LTTI is LONG allocate 100% to best Overall Rank asset (fallback to next best LONG asset). CASH when LTTI is SHORT.';
    case 'F': return 'When MTTI-BTC is LONG allocate 100% to Dominant Asset (fallback to most dominant LONG asset). CASH when MTTI-BTC is SHORT.';
    case 'G': return 'When MTTI-BTC is LONG allocate 100% to best Overall Rank asset (fallback to next best LONG asset). CASH when MTTI-BTC is SHORT.';
    case 'H': return 'When LTTI is LONG allocate 50% BTC and 50% to Dominant Asset (fallback to most dominant LONG asset). CASH when LTTI is SHORT.';
    case 'I': return 'When LTTI is LONG allocate 50% BTC and 50% to best Overall Rank asset (fallback to next best LONG asset). CASH when LTTI is SHORT.';
    case 'J': return 'Strategy J logic (step-by-step): 1) If LTTI is SHORT, allocate 100% to CASH. 2) If LTTI is LONG, evaluate assets by dominance order and only consider assets that are currently LONG. 3) Exclude BNB and DOGE entirely from this strategy. 4) For each eligible non-BTC asset, proposed allocation = Kelly Criterion (using the hardcoded Kelly backtest window that starts on 1 Jan 2023), except HYPE which is forced to 10%. 5) Build the non-BTC sleeve in dominance order with a hard cap of 60% total for all non-BTC assets combined; do not rescale to force 60%, and if adding the next less-dominant eligible asset would breach 60%, skip/cut off that asset. 6) After the non-BTC sleeve is set, allocate BTC only if BTC is LONG. 7) If BTC is LONG, BTC receives the remaining portfolio weight (100% minus the non-BTC sleeve). 8) If BTC is not LONG, the remaining weight stays in CASH. BTC is not capped by Kelly in this strategy.';
    default: return f;
  }
}

function pickFirstLong(order, longMask) {
  for (const i of order) {
    if (longMask[i]) return i;
  }
  return -1;
}

function computeAssetOverallRanks(assetBacktests) {
  const totalReturnVals = assetBacktests.map(b => parseFloat(b?.stats?.totalReturn) || -Infinity);
  const maxDrawdownVals = assetBacktests.map(b => parseFloat(b?.stats?.maxDrawdown) || Infinity);
  const sortinoVals = assetBacktests.map(b => parseSortino(b?.stats?.sortino));
  const omegaVals = assetBacktests.map(b => parseSortino(b?.stats?.omega));
  const kellyVals = assetBacktests.map(b => parseFloat(b?.stats?.kelly) || -Infinity);

  const retRanks = rankDescending(totalReturnVals);
  const ddRanks = rankDescending(maxDrawdownVals.map(v => -v));
  const sorRanks = rankDescending(sortinoVals);
  const omgRanks = rankDescending(omegaVals);
  const kelRanks = rankDescending(kellyVals);

  const cumulative = assetBacktests.map((_, i) => retRanks[i] + ddRanks[i] + sorRanks[i] + omgRanks[i] + kelRanks[i]);
  const indices = cumulative.map((_, i) => i);
  indices.sort((a, b) => cumulative[a] - cumulative[b]);

  const overallRanks = new Array(assetBacktests.length);
  for (let rank = 0; rank < indices.length; rank++) {
    overallRanks[indices[rank]] = rank + 1;
  }

  return overallRanks;
}

function allocationForFormula(formula, ctx) {
  const {
    n,
    lttiLong,
    btcLong,
    btcIdx,
    hasPrice,
    hasPaxgPrice,
    longMask,
    dominanceOrder,
    kellyFractions,
    assetNames,
    dominantLongIdx,
    rankedLongIdx,
  } = ctx;

  const weights = new Array(n).fill(0);
  let paxgWeight = 0;
  const addWeight = (idx, weight) => {
    if (idx < 0 || idx >= n || !hasPrice[idx]) return;
    weights[idx] += weight;
  };

  switch (formula) {
    case 'A':
      addWeight(btcIdx, 1);
      break;
    case 'B':
      if (lttiLong && btcLong) addWeight(btcIdx, 1);
      break;
    case 'C':
      if (lttiLong) {
        if (btcLong) addWeight(btcIdx, 1);
      } else {
        if (hasPaxgPrice) paxgWeight = 1;
      }
      break;
    case 'D':
      if (lttiLong) addWeight(dominantLongIdx, 1);
      break;
    case 'E':
      if (lttiLong) addWeight(rankedLongIdx, 1);
      break;
    case 'F':
      if (btcLong) addWeight(dominantLongIdx, 1);
      break;
    case 'G':
      if (btcLong) addWeight(rankedLongIdx, 1);
      break;
    case 'H':
      if (lttiLong) {
        addWeight(btcIdx, 0.5);
        addWeight(dominantLongIdx, 0.5);
      }
      break;
    case 'I':
      if (lttiLong) {
        addWeight(btcIdx, 0.5);
        addWeight(rankedLongIdx, 0.5);
      }
      break;
    case 'J':
      if (lttiLong) {
        let nonBtcAllocated = 0;
        for (const idx of dominanceOrder) {
          if (!longMask[idx] || !hasPrice[idx]) continue;
          const name = assetNames[idx];
          if (name === 'BNB' || name === 'DOGE') continue;
          if (name === 'BTC') continue;
          let alloc = name === 'HYPE' ? 0.10 : (kellyFractions[idx] ?? 0);
          if (!isFinite(alloc) || alloc <= 0) continue;
          if (nonBtcAllocated + alloc > 0.60) continue;
          nonBtcAllocated += alloc;
          addWeight(idx, alloc);
        }
        if (btcLong) {
          addWeight(btcIdx, Math.max(0, 1.0 - nonBtcAllocated));
        }
      }
      break;
  }

  return { weights, paxgWeight };
}

function runSingleFormula(formula, timeline, closeMaps, mttiAssets, dominanceOrder, overallOrder, lttiSignals, btcIdx, paxgMap, kellyFractions) {
  const INITIAL_CAPITAL = 1000;
  const n = mttiAssets.length;
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

  let lttiPtr = 0;
  let currentLttiSignal = 'CASH';
  let prevWeights = new Array(n).fill(0);
  let prevPaxgWeight = 0;

  for (let t = 0; t < timeline.length; t++) {
    const currTime = timeline[t];

    while (lttiPtr < lttiSignals.length && lttiSignals[lttiPtr].time <= currTime) {
      currentLttiSignal = lttiSignals[lttiPtr].signal;
      lttiPtr++;
    }

    const hasPrice = closeMaps.map(m => m.has(currTime));
    const hasPaxgPrice = Boolean(paxgMap?.has(currTime));
    const longMask = mttiAssets.map((_, i) => hasPrice[i] && closeMaps[i].get(currTime).signal === 'LONG');
    const btcLong = btcIdx >= 0 && longMask[btcIdx];
    const dominantLongIdx = pickFirstLong(dominanceOrder, longMask);
    const rankedLongIdx = pickFirstLong(overallOrder, longMask);

    if (t > 0) {
      const prevTime = timeline[t - 1];
      const assetReturns = mttiAssets.map((_, i) => {
        const prev = closeMaps[i].get(prevTime);
        const curr = closeMaps[i].get(currTime);
        if (!prev || !curr || prev.close === 0) return 0;
        return (curr.close - prev.close) / prev.close;
      });
      let paxgReturn = 0;
      if (paxgMap) {
        const prevPaxg = paxgMap.get(prevTime);
        const currPaxg = paxgMap.get(currTime);
        if (prevPaxg && currPaxg && prevPaxg.close > 0) {
          paxgReturn = (currPaxg.close - prevPaxg.close) / prevPaxg.close;
        }
      }

      let portfolioReturn = 0;
      for (let i = 0; i < n; i++) {
        portfolioReturn += prevWeights[i] * assetReturns[i];
      }
      portfolioReturn += prevPaxgWeight * paxgReturn;

      portfolioValue *= (1 + portfolioReturn);
    }

    if (portfolioValue > peakEquity) peakEquity = portfolioValue;
    const dd = (peakEquity - portfolioValue) / peakEquity;
    if (dd > maxDrawdown) maxDrawdown = dd;

    const { weights: currentWeights, paxgWeight } = allocationForFormula(formula, {
      n,
      lttiLong: currentLttiSignal === 'LONG',
      btcLong,
      btcIdx,
      hasPrice,
      hasPaxgPrice,
      longMask,
      dominanceOrder,
      kellyFractions,
      assetNames: mttiAssets.map(a => a.config.name),
      dominantLongIdx,
      rankedLongIdx,
    });

    const invested = (currentWeights.reduce((s, w) => s + w, 0) + paxgWeight) > 0;
    const allocMap = {};
    for (let i = 0; i < n; i++) {
      allocMap[mttiAssets[i].config.name] = currentWeights[i] * 100;
    }
    if (paxgMap) {
      allocMap.PAXG = paxgWeight * 100;
    }

    equity.push({ time: currTime, value: portfolioValue });
    barAllocations.push({ time: currTime, weights: allocMap });

    if (invested && !inTrade) {
      inTrade = true;
      tradeEntryValue = portfolioValue;
      tradeEntryTime = currTime;
    } else if (!invested && inTrade) {
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

    prevWeights = currentWeights;
    prevPaxgWeight = paxgWeight;
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
    equity,
    trades: tradeDetails,
    barAllocations,
    stats,
  };
}

/**
 * Run full allocation analysis: compare all formulas (A–J),
 * return asset table + equity curve + per-bar allocations for each.
 */
export function runAllocationAnalysis(mttiAssets, dominance, backtestStart = DEFAULT_BACKTEST_START, lttiAsset = null, paxgAsset = null) {
  const n = mttiAssets.length;
  if (n === 0) return null;

  const assetBacktests = mttiAssets.map(a => {
    const params = STRATEGY_PARAMS[a.config.strategy];
    if (!params) return null;
    return runBacktest(a.candles, a.compositeScores, params.longThresh, params.shortThresh, backtestStart);
  });
  const kellyReferenceBacktests = mttiAssets.map(a => {
    const params = STRATEGY_PARAMS[a.config.strategy];
    if (!params) return null;
    return runBacktest(a.candles, a.compositeScores, params.longThresh, params.shortThresh, KELLY_REFERENCE_START);
  });

  const sortinos = assetBacktests.map(b => parseSortino(b?.stats?.sortino));
  const kellyFractions = kellyReferenceBacktests.map(b => {
    const k = parseFloat(b?.stats?.kelly);
    if (isNaN(k) || !isFinite(k) || k <= 0) return 0;
    return k / 100;
  });

  const domScores = mttiAssets.map(a => {
    const d = dominance?.[a.config.name];
    return d ? d.wins - d.losses : 0;
  });
  const dominanceOrder = domScores.map((_, i) => i).sort((a, b) => domScores[b] - domScores[a]);
  const overallRanks = computeAssetOverallRanks(assetBacktests);
  const overallOrder = overallRanks.map((_, i) => i).sort((a, b) => overallRanks[a] - overallRanks[b]);

  const closeMaps = mttiAssets.map(a => {
    const map = new Map();
    for (let i = 0; i < a.candles.length; i++) {
      map.set(a.candles[i].time, { close: a.candles[i].close, signal: a.signals[i] });
    }
    return map;
  });
  const paxgMap = paxgAsset?.candles
    ? new Map(paxgAsset.candles.map(c => [c.time, { close: c.close }]))
    : null;

  const allTimes = new Set();
  for (const m of closeMaps) {
    for (const t of m.keys()) {
      if (t >= backtestStart) allTimes.add(t);
    }
  }
  if (paxgMap) {
    for (const t of paxgMap.keys()) {
      if (t >= backtestStart) allTimes.add(t);
    }
  }
  const timeline = [...allTimes].sort((a, b) => a - b);

  if (timeline.length < 2) return null;

  const btcMttiIdx = mttiAssets.findIndex(a => a.config.strategy === 'MTTI-BTC');
  const lttiSignals = lttiAsset
    ? lttiAsset.candles.map((c, i) => ({ time: c.time, signal: lttiAsset.signals[i] }))
    : null;

  const formulas = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const formulaResults = formulas.map(f => {
    const result = runSingleFormula(
      f,
      timeline,
      closeMaps,
      mttiAssets,
      dominanceOrder,
      overallOrder,
      lttiSignals ?? [],
      btcMttiIdx,
      paxgMap,
      kellyFractions
    );
    return { formula: f, label: formulaLabel(f), ...result };
  });

  const assetNames = mttiAssets.map(a => a.config.name);
  if (paxgMap) assetNames.push('PAXG');

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
          overallRank: overallRanks[i],
          signal: lastSignal,
          domScore: domScores[i],
          allocation: lastAlloc?.weights?.[a.config.name] ?? 0,
        };
      }).sort((a, b) => b.sortinoRaw - a.sortinoRaw),
    };
  }

  const comparison = formulaResults.map(r => ({
    formula: r.formula,
    label: r.label,
    totalReturn: r.totalReturn,
    maxDrawdown: r.stats.maxDrawdown,
    sortino: r.sortino,
    omega: r.stats.omega,
  }));

  const vals = {
    totalReturn: comparison.map(r => parseFloat(r.totalReturn) || -Infinity),
    maxDrawdown: comparison.map(r => parseFloat(r.maxDrawdown) || Infinity),
    sortino:     comparison.map(r => parseSortino(r.sortino)),
    omega:       comparison.map(r => parseSortino(r.omega)),
  };

  const retRanks = rankDescending(vals.totalReturn);
  const ddRanks  = rankDescending(vals.maxDrawdown.map(v => -v));
  const sorRanks = rankDescending(vals.sortino);
  const omgRanks = rankDescending(vals.omega);

  const cumScores = comparison.map((_, i) => retRanks[i] + ddRanks[i] + sorRanks[i] + omgRanks[i]);

  const indices = comparison.map((_, i) => i);
  indices.sort((a, b) => cumScores[a] - cumScores[b]);

  const strategyOverallRanks = new Array(comparison.length);
  for (let rank = 0; rank < indices.length; rank++) {
    strategyOverallRanks[indices[rank]] = rank + 1;
  }
  for (let i = 0; i < comparison.length; i++) {
    comparison[i].overallRank = strategyOverallRanks[i];
  }

  comparison.sort((a, b) => a.overallRank - b.overallRank);

  return {
    comparison,
    formulaDetails: formulaDetailsMap,
    assetNames,
  };
}
