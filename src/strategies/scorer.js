import {
  rsiScore,
  impulsiveMomentumScore,
  sdZeroLagScore,
  dpsdScore,
  rsiMomentumTrendScore,
  stochForLoopScore,
  smartVolSuperTrendScore,
} from '../indicators/mttiOthers.js';
import { qpoScore } from '../indicators/qpo.js';
import { fsvzoScore } from '../indicators/fsvzo.js';
import { madForLoopScore } from '../indicators/madForLoop.js';

const INDICATOR_FNS = {
  rsi: rsiScore,
  rsiMomentumTrend: rsiMomentumTrendScore,
  impulsiveMomentum: impulsiveMomentumScore,
  sdZeroLag: sdZeroLagScore,
  dpsd: dpsdScore,
  stochForLoop: stochForLoopScore,
  smartVolSuperTrend: smartVolSuperTrendScore,
  qpo: qpoScore,
  fsvzo: fsvzoScore,
  madForLoop: madForLoopScore,
};

/**
 * Run all indicators for a strategy and compute composite scores.
 * @param {Array} candles OHLCV candle data
 * @param {Object} strategyParams strategy config (e.g. MTTI_BTC_PARAMS)
 * @returns {{ indicatorResults: Object[], compositeScores: number[], signals: string[] }}
 */
export function runStrategy(candles, strategyParams) {
  const { indicatorOrder, indicatorCount, longThresh, shortThresh } = strategyParams;

  const indicatorResults = [];
  for (const key of indicatorOrder) {
    const fn = INDICATOR_FNS[key];
    const params = strategyParams[key];
    if (!fn || !params) {
      console.warn(`Missing indicator function or params for: ${key}`);
      continue;
    }
    const result = fn(candles, params);
    indicatorResults.push({ key, ...result });
  }

  const compositeScores = new Array(candles.length).fill(0);
  for (let i = 0; i < candles.length; i++) {
    let sum = 0;
    for (const r of indicatorResults) {
      sum += r.scores[i];
    }
    compositeScores[i] = sum / indicatorCount;
  }

  const signals = new Array(candles.length).fill('CASH');
  for (let i = 0; i < candles.length; i++) {
    const s = compositeScores[i];
    if (s >= longThresh) {
      signals[i] = 'LONG';
    } else if (s <= shortThresh) {
      signals[i] = 'CASH';
    } else {
      signals[i] = i > 0 ? signals[i - 1] : 'CASH';
    }
  }

  return { indicatorResults, compositeScores, signals };
}
