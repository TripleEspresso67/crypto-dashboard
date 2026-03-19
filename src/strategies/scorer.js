import { rsiScore } from '../indicators/rsi.js';
import { rsiMomentumTrendScore } from '../indicators/rsiMomentumTrend.js';
import { impulsiveMomentumScore } from '../indicators/impulsiveMomentum.js';
import { sdZeroLagScore } from '../indicators/sdZeroLag.js';
import { dpsdScore } from '../indicators/dpsd.js';
import { stochForLoopScore } from '../indicators/stochForLoop.js';
import { smartVolSuperTrendScore } from '../indicators/smartVolSuperTrend.js';
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

  const signals = compositeScores.map(s =>
    s >= longThresh ? 'LONG' : s <= shortThresh ? 'CASH' : 'NEUTRAL'
  );

  return { indicatorResults, compositeScores, signals };
}
