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

function normalizeMetric(values, higherIsBetter = true) {
  const finite = values.filter(v => isFinite(v));
  if (finite.length === 0) return new Array(values.length).fill(0);

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const range = max - min;

  return values.map(v => {
    let value = v;
    if (!isFinite(value)) {
      if (value === Infinity) value = max;
      else if (value === -Infinity) value = min;
      else value = min;
    }
    const base = range === 0 ? 0.5 : (value - min) / range;
    return higherIsBetter ? base : 1 - base;
  });
}

function formulaLabel(f) {
  switch (f) {
    case 'A': return 'BTC Buy & Hold (100% BTC).';
    case 'B': return 'When BTC LTTI 3D is LONG, allocate to BTC only when MTTI-BTC is LONG. CASH when BTC LTTI 3D is SHORT.';
    case 'C': return 'When BTC LTTI 3D is LONG allocate 100% to Dominant Asset (fallback to most dominant LONG asset). CASH when BTC LTTI 3D is SHORT.';
    case 'D': return 'When BTC LTTI 3D is LONG allocate 100% to best Overall Rank asset (fallback to next best LONG asset). CASH when BTC LTTI 3D is SHORT.';
    case 'E': return 'When MTTI-BTC is LONG allocate 100% to Dominant Asset (fallback to most dominant LONG asset). CASH when MTTI-BTC is SHORT.';
    case 'F': return 'When MTTI-BTC is LONG allocate 100% to best Overall Rank asset (fallback to next best LONG asset). CASH when MTTI-BTC is SHORT.';
    case 'G': return 'When BTC LTTI 3D is LONG allocate 50% BTC and 50% to Dominant Asset (fallback to most dominant LONG asset). CASH when BTC LTTI 3D is SHORT.';
    case 'H': return 'When BTC LTTI 3D is LONG allocate 50% BTC and 50% to best Overall Rank asset (fallback to next best LONG asset). CASH when BTC LTTI 3D is SHORT.';
    case 'I': return 'Strategy I logic (step-by-step): 1) If BTC LTTI 3D is SHORT, allocate 100% to CASH. 2) If BTC LTTI 3D is LONG, evaluate assets by dominance order and only consider assets that are currently LONG. 3) Exclude BNB and DOGE entirely from this strategy. 4) For each eligible non-BTC asset, proposed allocation = Kelly Criterion (using the hardcoded Kelly backtest window that starts on 1 Jan 2023), except HYPE which is forced to 10%. 5) Build the non-BTC sleeve in dominance order with a hard cap of 60% total for all non-BTC assets combined; do not rescale to force 60%, and if adding the next less-dominant eligible asset would breach 60%, skip/cut off that asset. 6) After the non-BTC sleeve is set, allocate BTC only if BTC is LONG. 7) If BTC is LONG, BTC receives the remaining portfolio weight (100% minus the non-BTC sleeve). 8) If BTC is not LONG, the remaining weight stays in CASH. BTC is not capped by Kelly in this strategy.';
    case 'J': return 'Same as Strategy I, but when BTC LTTI 3D is SHORT and MTTI-BTC is LONG, allocate 50% to BTC (remaining 50% in CASH).';
    case 'K': return 'Same as Strategy I, but include BNB and DOGE.';
    case 'L': return 'Same as Strategy I, but with a non-BTC hard cap of 80%.';
    case 'M': return 'Same as Strategy I, but with no non-BTC hard cap.';
    case 'N': return 'Same as Strategy I, but do not use Kelly allocations. Use hardcoded caps in dominance order: BTC uncapped; total non-BTC cap 80%; SOL cap 60%; ETH cap 50%; SUI+HYPE joint cap 20%.';
    case 'O': return 'When BTC LTTI 3D is LONG, allocate 100% to Dominant Asset (include BNB and DOGE). If SUI/HYPE is selected, cap SUI+HYPE joint allocation at 30% and allocate the remainder to the next most dominant LONG asset(s) as needed to reach 100%. All assets must be LONG to be considered. CASH when BTC LTTI 3D is SHORT.';
    case 'P': return 'When BTC LTTI 3D is LONG, allocate 100% to Dominant Asset (exclude BNB and DOGE). If SUI/HYPE is selected, cap SUI+HYPE joint allocation at 30% and allocate the remainder to the next most dominant LONG asset(s) as needed to reach 100%. All assets must be LONG to be considered. CASH when BTC LTTI 3D is SHORT.';
    case 'Q': return 'Same as Strategy P, but use hard caps: BTC max 100%; combined non-BTC max 80%; ETH max 80%; SOL max 80%; SUI+HYPE combined max 20%.';
    case 'R': return 'Same as Strategy P, but BTC LTTI 2D is used instead of BTC LTTI 3D.';
    case 'S': return 'Same as Strategy P, but uses condition "when MTTI-BTC is LONG" instead of "when BTC LTTI 3D is LONG".';
    case 'T': return 'When BTC LTTI 3D is LONG, allocate to dominant assets in order of dominance. BNB, DOGE, SUI, and HYPE have a 30% joint allocation cap. BTC, ETH, and SOL are uncapped. CASH when BTC LTTI 3D is SHORT.';
    case 'U': return 'Same as Strategy T, but when BTC LTTI 3D is SHORT and MTTI-BTC is LONG, allow a 30% total allocation (remaining 70% in CASH).';
    case 'V': return 'Same as Strategy T, but BNB, DOGE, SUI, and HYPE have a 20% joint allocation cap.';
    case 'W': return 'Same as Strategy T 2, but BNB, DOGE, SUI, and HYPE have a 20% joint allocation cap.';
    case 'X': return 'Same as Strategy T 2, but when BTC LTTI 3D is SHORT and MTTI-BTC is LONG, allocate 50% to BTC (remaining 50% in CASH).';
    case 'Y': return 'Same as Strategy T 2, but when BTC LTTI 3D is SHORT and MTTI-BTC is LONG, allow a 30% total allocation excluding SUI and HYPE (remaining 70% in CASH).';
    default: return f;
  }
}

function formulaDisplay(f) {
  switch (f) {
    case 'M': return 'I 2';
    case 'K': return 'I 3';
    case 'Q': return 'P 2';
    case 'R': return 'P 3';
    case 'S': return 'P 4';
    case 'O': return 'P 1';
    case 'U': return 'T 2';
    case 'V': return 'T 1';
    case 'W': return 'T 3';
    case 'X': return 'T 4';
    case 'Y': return 'T 5';
    default: return f;
  }
}

function applyKellyDominanceAllocation({
  weights,
  addWeight,
  longMask,
  hasPrice,
  dominanceOrder,
  kellyFractions,
  assetNames,
  btcLong,
  btcIdx,
  includeBnbAndDoge = false,
  nonBtcCap = 0.60,
}) {
  let nonBtcAllocated = 0;
  for (const idx of dominanceOrder) {
    if (!longMask[idx] || !hasPrice[idx]) continue;
    const name = assetNames[idx];
    if (!includeBnbAndDoge && (name === 'BNB' || name === 'DOGE')) continue;
    if (name === 'BTC') continue;
    let alloc = name === 'HYPE' ? 0.10 : (kellyFractions[idx] ?? 0);
    if (!isFinite(alloc) || alloc <= 0) continue;
    if (nonBtcCap !== null && nonBtcCap !== undefined) {
      if (nonBtcAllocated + alloc > nonBtcCap) continue;
    }
    nonBtcAllocated += alloc;
    addWeight(idx, alloc);
  }
  if (btcLong) {
    addWeight(btcIdx, Math.max(0, 1.0 - nonBtcAllocated));
  }
  return nonBtcAllocated;
}

function applyDominanceWithSuiHypeJointCap({
  addWeight,
  longMask,
  hasPrice,
  dominanceOrder,
  assetNames,
  excludeBnbAndDoge = false,
  suiHypeJointCap = 0.30,
}) {
  let remaining = 1.0;
  let suiHypeAllocated = 0;

  for (const idx of dominanceOrder) {
    if (remaining <= 0) break;
    if (!longMask[idx] || !hasPrice[idx]) continue;

    const name = assetNames[idx];
    if (excludeBnbAndDoge && (name === 'BNB' || name === 'DOGE')) continue;

    let alloc = remaining;
    if (name === 'SUI' || name === 'HYPE') {
      const remainingJoint = suiHypeJointCap - suiHypeAllocated;
      if (remainingJoint <= 0) continue;
      alloc = Math.min(alloc, remainingJoint);
    }

    if (!isFinite(alloc) || alloc <= 0) continue;
    addWeight(idx, alloc);
    remaining -= alloc;
    if (name === 'SUI' || name === 'HYPE') suiHypeAllocated += alloc;
  }
}

function applyDominanceWithJointGroupCap({
  addWeight,
  longMask,
  hasPrice,
  dominanceOrder,
  assetNames,
  cappedAssetSet,
  excludedAssetSet = new Set(),
  jointCap = 0.30,
  totalAllocationTarget = 1.0,
}) {
  let remaining = Math.max(0, Math.min(1, totalAllocationTarget));
  let cappedAllocated = 0;

  for (const idx of dominanceOrder) {
    if (remaining <= 0) break;
    if (!longMask[idx] || !hasPrice[idx]) continue;

    const name = assetNames[idx];
    if (excludedAssetSet.has(name)) continue;
    let alloc = remaining;
    if (cappedAssetSet.has(name)) {
      const remainingJoint = jointCap - cappedAllocated;
      if (remainingJoint <= 0) continue;
      alloc = Math.min(alloc, remainingJoint);
    }

    if (!isFinite(alloc) || alloc <= 0) continue;
    addWeight(idx, alloc);
    remaining -= alloc;
    if (cappedAssetSet.has(name)) cappedAllocated += alloc;
  }
}

function pickFirstLong(order, longMask) {
  for (const i of order) {
    if (longMask[i]) return i;
  }
  return -1;
}

function allocationsChanged(prevWeights, nextWeights, prevPaxgWeight, nextPaxgWeight, epsilon = 1e-10) {
  if (Math.abs((prevPaxgWeight || 0) - (nextPaxgWeight || 0)) > epsilon) return true;
  const n = Math.max(prevWeights?.length || 0, nextWeights?.length || 0);
  for (let i = 0; i < n; i++) {
    const prev = prevWeights?.[i] || 0;
    const next = nextWeights?.[i] || 0;
    if (Math.abs(prev - next) > epsilon) return true;
  }
  return false;
}

function countExecutionChanges(prevWeights, nextWeights, prevPaxgWeight, nextPaxgWeight, epsilon = 1e-10) {
  let executions = 0;
  if (Math.abs((prevPaxgWeight || 0) - (nextPaxgWeight || 0)) > epsilon) executions += 1;
  const n = Math.max(prevWeights?.length || 0, nextWeights?.length || 0);
  for (let i = 0; i < n; i++) {
    const prev = prevWeights?.[i] || 0;
    const next = nextWeights?.[i] || 0;
    if (Math.abs(prev - next) > epsilon) executions += 1;
  }
  return executions;
}

function computeDominanceOrdersByTimeline(timeline, mttiAssets, ratioPairs, fallbackOrder) {
  if (!ratioPairs || ratioPairs.length === 0) {
    return timeline.map(() => fallbackOrder);
  }

  const assetNames = mttiAssets.map(a => a.config.name);
  const assetSet = new Set(assetNames);
  const relevantPairs = ratioPairs
    .filter(p => assetSet.has(p.numerator) && assetSet.has(p.denominator))
    .map(p => ({
      numerator: p.numerator,
      denominator: p.denominator,
      candles: p.candles || [],
      signals: p.signals || [],
      ptr: 0,
      currentSignal: null,
    }));

  if (relevantPairs.length === 0) {
    return timeline.map(() => fallbackOrder);
  }

  const orders = [];
  for (const t of timeline) {
    const wins = {};
    const losses = {};
    for (const name of assetNames) {
      wins[name] = 0;
      losses[name] = 0;
    }

    for (const pair of relevantPairs) {
      while (
        pair.ptr < pair.candles.length &&
        pair.ptr < pair.signals.length &&
        pair.candles[pair.ptr].time <= t
      ) {
        pair.currentSignal = pair.signals[pair.ptr];
        pair.ptr += 1;
      }
      if (!pair.currentSignal) continue;

      if (pair.currentSignal === 'LONG') {
        wins[pair.numerator] += 1;
        losses[pair.denominator] += 1;
      } else {
        wins[pair.denominator] += 1;
        losses[pair.numerator] += 1;
      }
    }

    const order = assetNames
      .map((name, i) => ({ i, name, score: wins[name] - losses[name] }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.name.localeCompare(b.name);
      })
      .map(x => x.i);
    orders.push(order);
  }

  return orders;
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
    ltti3dLong,
    ltti2dLong,
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
      if (ltti3dLong && btcLong) addWeight(btcIdx, 1);
      break;
    case 'C':
      if (ltti3dLong) addWeight(dominantLongIdx, 1);
      break;
    case 'D':
      if (lttiLong) addWeight(rankedLongIdx, 1);
      break;
    case 'E':
      if (btcLong) addWeight(dominantLongIdx, 1);
      break;
    case 'F':
      if (btcLong) addWeight(rankedLongIdx, 1);
      break;
    case 'G':
      if (ltti3dLong) {
        addWeight(btcIdx, 0.5);
        addWeight(dominantLongIdx, 0.5);
      }
      break;
    case 'H':
      if (ltti3dLong) {
        addWeight(btcIdx, 0.5);
        addWeight(rankedLongIdx, 0.5);
      }
      break;
    case 'I':
      if (ltti3dLong) {
        applyKellyDominanceAllocation({
          weights,
          addWeight,
          longMask,
          hasPrice,
          dominanceOrder,
          kellyFractions,
          assetNames,
          btcLong,
          btcIdx,
          includeBnbAndDoge: false,
          nonBtcCap: 0.60,
        });
      }
      break;
    case 'J':
      if (lttiLong) {
        applyKellyDominanceAllocation({
          weights,
          addWeight,
          longMask,
          hasPrice,
          dominanceOrder,
          kellyFractions,
          assetNames,
          btcLong,
          btcIdx,
          includeBnbAndDoge: false,
          nonBtcCap: 0.60,
        });
      } else if (btcLong) {
        addWeight(btcIdx, 0.50);
      }
      break;
    case 'K':
      if (ltti3dLong) {
        applyKellyDominanceAllocation({
          weights,
          addWeight,
          longMask,
          hasPrice,
          dominanceOrder,
          kellyFractions,
          assetNames,
          btcLong,
          btcIdx,
          includeBnbAndDoge: true,
          nonBtcCap: 0.60,
        });
      }
      break;
    case 'L':
      if (lttiLong) {
        applyKellyDominanceAllocation({
          weights,
          addWeight,
          longMask,
          hasPrice,
          dominanceOrder,
          kellyFractions,
          assetNames,
          btcLong,
          btcIdx,
          includeBnbAndDoge: false,
          nonBtcCap: 0.80,
        });
      }
      break;
    case 'M':
      if (ltti3dLong) {
        applyKellyDominanceAllocation({
          weights,
          addWeight,
          longMask,
          hasPrice,
          dominanceOrder,
          kellyFractions,
          assetNames,
          btcLong,
          btcIdx,
          includeBnbAndDoge: false,
          nonBtcCap: null,
        });
      }
      break;
    case 'N':
      if (lttiLong) {
        let nonBtcAllocated = 0;
        let suiHypeAllocated = 0;

        for (const idx of dominanceOrder) {
          if (!longMask[idx] || !hasPrice[idx]) continue;
          const name = assetNames[idx];
          if (name === 'BNB' || name === 'DOGE' || name === 'BTC') continue;

          const remainingNonBtc = 0.80 - nonBtcAllocated;
          if (remainingNonBtc <= 0) break;

          let capForAsset = 0.80;
          if (name === 'SOL') capForAsset = 0.60;
          else if (name === 'ETH') capForAsset = 0.50;
          else if (name === 'SUI' || name === 'HYPE') capForAsset = 0.20;

          let alloc = Math.min(capForAsset, remainingNonBtc);

          if (name === 'SUI' || name === 'HYPE') {
            const remainingJoint = 0.20 - suiHypeAllocated;
            if (remainingJoint <= 0) continue;
            alloc = Math.min(alloc, remainingJoint);
          }

          if (!isFinite(alloc) || alloc <= 0) continue;
          addWeight(idx, alloc);
          nonBtcAllocated += alloc;
          if (name === 'SUI' || name === 'HYPE') suiHypeAllocated += alloc;
        }

        if (btcLong) {
          addWeight(btcIdx, Math.max(0, 1.0 - nonBtcAllocated));
        }
      }
      break;
    case 'O':
      if (ltti3dLong) {
        applyDominanceWithSuiHypeJointCap({
          addWeight,
          longMask,
          hasPrice,
          dominanceOrder,
          assetNames,
          excludeBnbAndDoge: false,
          suiHypeJointCap: 0.30,
        });
      }
      break;
    case 'P':
      if (ltti3dLong) {
        applyDominanceWithSuiHypeJointCap({
          addWeight,
          longMask,
          hasPrice,
          dominanceOrder,
          assetNames,
          excludeBnbAndDoge: true,
          suiHypeJointCap: 0.30,
        });
      }
      break;
    case 'Q':
      if (ltti3dLong) {
        let nonBtcAllocated = 0;
        let suiHypeAllocated = 0;
        for (const idx of dominanceOrder) {
          if (!longMask[idx] || !hasPrice[idx]) continue;
          const name = assetNames[idx];
          if (name === 'BNB' || name === 'DOGE') continue;

          if (name === 'BTC') {
            if (btcLong) {
              addWeight(btcIdx, Math.max(0, 1.0 - nonBtcAllocated));
            }
            break;
          }

          const remainingNonBtc = 0.80 - nonBtcAllocated;
          if (remainingNonBtc <= 0) {
            if (btcLong) addWeight(btcIdx, Math.max(0, 1.0 - nonBtcAllocated));
            break;
          }

          let capForAsset = 0.80;
          if (name === 'ETH') capForAsset = 0.80;
          else if (name === 'SOL') capForAsset = 0.80;
          else if (name === 'SUI' || name === 'HYPE') capForAsset = 0.20;

          let alloc = Math.min(capForAsset, remainingNonBtc);
          if (name === 'SUI' || name === 'HYPE') {
            const remainingJoint = 0.20 - suiHypeAllocated;
            if (remainingJoint <= 0) continue;
            alloc = Math.min(alloc, remainingJoint);
          }

          if (!isFinite(alloc) || alloc <= 0) continue;
          addWeight(idx, alloc);
          nonBtcAllocated += alloc;
          if (name === 'SUI' || name === 'HYPE') suiHypeAllocated += alloc;
        }
      }
      break;
    case 'R':
      if (ltti2dLong) {
        applyDominanceWithSuiHypeJointCap({
          addWeight,
          longMask,
          hasPrice,
          dominanceOrder,
          assetNames,
          excludeBnbAndDoge: true,
          suiHypeJointCap: 0.30,
        });
      }
      break;
    case 'S':
      if (btcLong) {
        applyDominanceWithSuiHypeJointCap({
          addWeight,
          longMask,
          hasPrice,
          dominanceOrder,
          assetNames,
          excludeBnbAndDoge: true,
          suiHypeJointCap: 0.30,
        });
      }
      break;
    case 'T':
      if (ltti3dLong) {
        applyDominanceWithJointGroupCap({
          addWeight,
          longMask,
          hasPrice,
          dominanceOrder,
          assetNames,
          cappedAssetSet: new Set(['BNB', 'DOGE', 'SUI', 'HYPE']),
          jointCap: 0.30,
        });
      }
      break;
    case 'U':
      if (ltti3dLong) {
        applyDominanceWithJointGroupCap({
          addWeight,
          longMask,
          hasPrice,
          dominanceOrder,
          assetNames,
          cappedAssetSet: new Set(['BNB', 'DOGE', 'SUI', 'HYPE']),
          jointCap: 0.30,
          totalAllocationTarget: 1.0,
        });
      } else if (btcLong) {
        applyDominanceWithJointGroupCap({
          addWeight,
          longMask,
          hasPrice,
          dominanceOrder,
          assetNames,
          cappedAssetSet: new Set(['BNB', 'DOGE', 'SUI', 'HYPE']),
          jointCap: 0.30,
          totalAllocationTarget: 0.30,
        });
      }
      break;
    case 'V':
      if (ltti3dLong) {
        applyDominanceWithJointGroupCap({
          addWeight,
          longMask,
          hasPrice,
          dominanceOrder,
          assetNames,
          cappedAssetSet: new Set(['BNB', 'DOGE', 'SUI', 'HYPE']),
          jointCap: 0.20,
          totalAllocationTarget: 1.0,
        });
      }
      break;
    case 'W':
      if (ltti3dLong) {
        applyDominanceWithJointGroupCap({
          addWeight,
          longMask,
          hasPrice,
          dominanceOrder,
          assetNames,
          cappedAssetSet: new Set(['BNB', 'DOGE', 'SUI', 'HYPE']),
          jointCap: 0.20,
          totalAllocationTarget: 1.0,
        });
      } else if (btcLong) {
        applyDominanceWithJointGroupCap({
          addWeight,
          longMask,
          hasPrice,
          dominanceOrder,
          assetNames,
          cappedAssetSet: new Set(['BNB', 'DOGE', 'SUI', 'HYPE']),
          jointCap: 0.20,
          totalAllocationTarget: 0.20,
        });
      }
      break;
    case 'X':
      if (ltti3dLong) {
        applyDominanceWithJointGroupCap({
          addWeight,
          longMask,
          hasPrice,
          dominanceOrder,
          assetNames,
          cappedAssetSet: new Set(['BNB', 'DOGE', 'SUI', 'HYPE']),
          jointCap: 0.30,
          totalAllocationTarget: 1.0,
        });
      } else if (btcLong) {
        addWeight(btcIdx, 0.50);
      }
      break;
    case 'Y':
      if (ltti3dLong) {
        applyDominanceWithJointGroupCap({
          addWeight,
          longMask,
          hasPrice,
          dominanceOrder,
          assetNames,
          cappedAssetSet: new Set(['BNB', 'DOGE', 'SUI', 'HYPE']),
          jointCap: 0.30,
          totalAllocationTarget: 1.0,
        });
      } else if (btcLong) {
        applyDominanceWithJointGroupCap({
          addWeight,
          longMask,
          hasPrice,
          dominanceOrder,
          assetNames,
          cappedAssetSet: new Set(['BNB', 'DOGE']),
          excludedAssetSet: new Set(['SUI', 'HYPE']),
          jointCap: 0.30,
          totalAllocationTarget: 0.30,
        });
      }
      break;
  }

  return { weights, paxgWeight };
}

function runSingleFormula(
  formula,
  timeline,
  closeMaps,
  mttiAssets,
  dominanceOrdersByIndex,
  overallOrder,
  ltti3dSignals,
  ltti2dSignals,
  btcIdx,
  paxgMap,
  kellyFractions
) {
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

  let ltti3dPtr = 0;
  let ltti2dPtr = 0;
  let currentLtti3dSignal = 'CASH';
  let currentLtti2dSignal = 'CASH';
  let prevWeights = new Array(n).fill(0);
  let prevPaxgWeight = 0;
  let allocationChangeTrades = 0;
  let numberOfExecutions = 0;
  let hasPrevAllocation = false;

  for (let t = 0; t < timeline.length; t++) {
    const currTime = timeline[t];

    while (ltti3dPtr < ltti3dSignals.length && ltti3dSignals[ltti3dPtr].time <= currTime) {
      currentLtti3dSignal = ltti3dSignals[ltti3dPtr].signal;
      ltti3dPtr++;
    }
    while (ltti2dPtr < ltti2dSignals.length && ltti2dSignals[ltti2dPtr].time <= currTime) {
      currentLtti2dSignal = ltti2dSignals[ltti2dPtr].signal;
      ltti2dPtr++;
    }

    const hasPrice = closeMaps.map(m => m.has(currTime));
    const hasPaxgPrice = Boolean(paxgMap?.has(currTime));
    const longMask = mttiAssets.map((_, i) => hasPrice[i] && closeMaps[i].get(currTime).signal === 'LONG');
    const dominanceOrder = dominanceOrdersByIndex[t] || [];
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
      ltti3dLong: currentLtti3dSignal === 'LONG',
      ltti2dLong: currentLtti2dSignal === 'LONG',
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

    if (!hasPrevAllocation) {
      if (invested) allocationChangeTrades += 1;
      numberOfExecutions += countExecutionChanges(new Array(n).fill(0), currentWeights, 0, paxgWeight);
      hasPrevAllocation = true;
    } else {
      const executions = countExecutionChanges(prevWeights, currentWeights, prevPaxgWeight, paxgWeight);
      numberOfExecutions += executions;
      if (executions > 0 && allocationsChanged(prevWeights, currentWeights, prevPaxgWeight, paxgWeight)) {
        allocationChangeTrades += 1;
      }
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
  let kelly = NaN;

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

  if (tradePnls.length > 0) {
    const winningTrades = tradePnls.filter(r => r > 0);
    const losingTradesAbs = tradePnls.filter(r => r < 0).map(r => -r);
    const p = winningTrades.length / tradePnls.length;
    const q = 1 - p;

    if (winningTrades.length === 0) {
      kelly = -1;
    } else if (losingTradesAbs.length === 0) {
      kelly = 1;
    } else {
      const avgWin = winningTrades.reduce((s, v) => s + v, 0) / winningTrades.length;
      const avgLoss = losingTradesAbs.reduce((s, v) => s + v, 0) / losingTradesAbs.length;
      const b = avgLoss > 0 ? avgWin / avgLoss : NaN;
      kelly = b > 0 ? p - (q / b) : NaN;
    }
  }

  const stats = {
    initialCapital: INITIAL_CAPITAL,
    finalEquity: finalEquity.toFixed(2),
    totalReturn: totalReturn.toFixed(2),
    buyHoldReturn: '--',
    totalTrades: tradeDetails.length,
    numberOfTrades: allocationChangeTrades,
    numberOfExecutions,
    wins,
    losses,
    winRate: winRate.toFixed(1),
    maxDrawdown: (maxDrawdown * 100).toFixed(2),
    profitFactor: profitFactor === Infinity ? 'Inf' : profitFactor.toFixed(2),
    sharpe: fmtRatio(sharpe),
    sortino: fmtRatio(sortino),
    omega: fmtRatio(omega),
    kelly: isNaN(kelly) ? '--' : (kelly * 100).toFixed(2),
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
 * Run full allocation analysis: compare all formulas (A–Q),
 * return asset table + equity curve + per-bar allocations for each.
 */
export function runAllocationAnalysis(
  mttiAssets,
  dominance,
  ratioPairs,
  backtestStart = DEFAULT_BACKTEST_START,
  ltti3dAsset = null,
  paxgAsset = null,
  ltti2dAsset = null
) {
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
  const fallbackDominanceOrder = domScores.map((_, i) => i).sort((a, b) => domScores[b] - domScores[a]);
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

  const dominanceOrdersByIndex = computeDominanceOrdersByTimeline(
    timeline,
    mttiAssets,
    ratioPairs,
    fallbackDominanceOrder
  );

  const btcMttiIdx = mttiAssets.findIndex(a => a.config.strategy === 'MTTI-BTC');
  const ltti3dSignals = ltti3dAsset
    ? ltti3dAsset.candles.map((c, i) => ({ time: c.time, signal: ltti3dAsset.signals[i] }))
    : null;
  const ltti2dSignals = ltti2dAsset
    ? ltti2dAsset.candles.map((c, i) => ({ time: c.time, signal: ltti2dAsset.signals[i] }))
    : null;

  const formulas = ['A', 'B', 'C', 'E', 'G', 'I', 'K', 'M', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y'];
  const formulaResults = formulas.map(f => {
    const result = runSingleFormula(
      f,
      timeline,
      closeMaps,
      mttiAssets,
      dominanceOrdersByIndex,
      overallOrder,
      ltti3dSignals ?? [],
      ltti2dSignals ?? [],
      btcMttiIdx,
      paxgMap,
      kellyFractions
    );
    return { formula: f, displayFormula: formulaDisplay(f), label: formulaLabel(f), ...result };
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
    displayFormula: r.displayFormula,
    label: r.label,
    totalReturn: r.totalReturn,
    totalTrades: r.stats.numberOfTrades ?? r.stats.totalTrades,
    numberOfExecutions: r.stats.numberOfExecutions ?? 0,
    maxDrawdown: r.stats.maxDrawdown,
    sortino: r.sortino,
    omega: r.stats.omega,
    kelly: r.stats.kelly ?? '--',
  }));

  const vals = {
    totalReturn: comparison.map(r => parseFloat(r.totalReturn) || -Infinity),
    totalTrades: comparison.map(r => parseFloat(r.totalTrades) || -Infinity),
    numberOfExecutions: comparison.map(r => parseFloat(r.numberOfExecutions) || -Infinity),
    maxDrawdown: comparison.map(r => parseFloat(r.maxDrawdown) || Infinity),
    sortino:     comparison.map(r => parseSortino(r.sortino)),
    omega:       comparison.map(r => parseSortino(r.omega)),
    kelly:       comparison.map(r => parseFloat(r.kelly) || -Infinity),
  };

  const retRanks = rankDescending(vals.totalReturn);
  const trdRanks = rankDescending(vals.totalTrades.map(v => -v));
  const exeRanks = rankDescending(vals.numberOfExecutions.map(v => -v));
  const ddRanks  = rankDescending(vals.maxDrawdown.map(v => -v));
  const sorRanks = rankDescending(vals.sortino);
  const omgRanks = rankDescending(vals.omega);
  const kelRanks = rankDescending(vals.kelly);

  const cumScores = comparison.map((_, i) => retRanks[i] + trdRanks[i] + exeRanks[i] + ddRanks[i] + sorRanks[i] + omgRanks[i] + kelRanks[i]);

  const indices = comparison.map((_, i) => i);
  indices.sort((a, b) => cumScores[a] - cumScores[b]);

  const strategyOverallRanks = new Array(comparison.length);
  for (let rank = 0; rank < indices.length; rank++) {
    strategyOverallRanks[indices[rank]] = rank + 1;
  }
  const normalizedTotalReturn = normalizeMetric(vals.totalReturn, true);
  const normalizedTotalTrades = normalizeMetric(vals.totalTrades, false);
  const normalizedExecutions = normalizeMetric(vals.numberOfExecutions, false);
  const normalizedMaxDrawdown = normalizeMetric(vals.maxDrawdown, false);
  const normalizedSortino = normalizeMetric(vals.sortino, true);
  const normalizedOmega = normalizeMetric(vals.omega, true);
  const normalizedKelly = normalizeMetric(vals.kelly, true);

  const normalizedScores = comparison.map((_, i) =>
    normalizedTotalReturn[i] +
    normalizedTotalTrades[i] +
    normalizedExecutions[i] +
    normalizedMaxDrawdown[i] +
    normalizedSortino[i] +
    normalizedOmega[i] +
    normalizedKelly[i]
  );
  const normalizedRanks = rankDescending(normalizedScores);

  const performanceScores = comparison.map((_, i) =>
    normalizedTotalReturn[i] +
    normalizedMaxDrawdown[i]
  );
  const performanceRanks = rankDescending(performanceScores);

  for (let i = 0; i < comparison.length; i++) {
    comparison[i].simpleRank = strategyOverallRanks[i];
    comparison[i].overallRank = strategyOverallRanks[i];
    comparison[i].normalizedRank = normalizedRanks[i];
    comparison[i].normalizedScore = normalizedScores[i];
    comparison[i].performanceRank = performanceRanks[i];
    comparison[i].performanceScore = performanceScores[i];
  }

  comparison.sort((a, b) => a.simpleRank - b.simpleRank);

  return {
    comparison,
    formulaDetails: formulaDetailsMap,
    assetNames,
  };
}
