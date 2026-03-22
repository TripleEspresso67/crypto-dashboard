import { runStrategy } from './scorer.js';
import { MTTI_OTHERS_PARAMS } from './mttiOthersConfig.js';

const BACKTEST_START = new Date('2023-01-01T00:00:00Z').getTime();

function dailyLogReturns(candles) {
  const returns = [];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].time >= BACKTEST_START && candles[i - 1].close > 0) {
      returns.push(Math.log(candles[i].close / candles[i - 1].close));
    }
  }
  return returns;
}

function computeSharpe(returns) {
  if (returns.length < 2) return NaN;
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (mean / std) * Math.sqrt(365);
}

function computeSortino(returns) {
  if (returns.length < 2) return NaN;
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const downsideSquared = returns
    .filter(r => r < 0)
    .map(r => r * r);
  if (downsideSquared.length === 0) return mean > 0 ? Infinity : 0;
  const downsideDev = Math.sqrt(downsideSquared.reduce((s, v) => s + v, 0) / returns.length);
  if (downsideDev === 0) return 0;
  return (mean / downsideDev) * Math.sqrt(365);
}

function computeOmega(returns, threshold = 0) {
  if (returns.length === 0) return NaN;
  let gains = 0;
  let losses = 0;
  for (const r of returns) {
    if (r > threshold) gains += r - threshold;
    else losses += threshold - r;
  }
  if (losses === 0) return gains > 0 ? Infinity : 1;
  return 1 + gains / losses;
}

/**
 * Compute annualized volatility (stdev of daily log returns) for an asset.
 */
function computeVolatility(candles) {
  if (candles.length < 2) return 0;
  const returns = [];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i - 1].close > 0) {
      returns.push(Math.log(candles[i].close / candles[i - 1].close));
    }
  }
  if (returns.length === 0) return 0;
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(365);
}

/**
 * Build synthetic OHLCV candles for the ratio A/B,
 * only for timestamps present in both series.
 */
function buildRatioCandles(candlesA, candlesB) {
  const mapB = new Map();
  for (const c of candlesB) mapB.set(c.time, c);

  const ratio = [];
  for (const a of candlesA) {
    const b = mapB.get(a.time);
    if (!b || b.close === 0 || b.open === 0 || b.high === 0 || b.low === 0) continue;
    ratio.push({
      time: a.time,
      open: a.open / b.open,
      high: a.high / b.low,
      low: a.low / b.high,
      close: a.close / b.close,
      volume: (a.volume + b.volume) / 2,
    });
  }
  return ratio;
}

/**
 * Compute all pairwise ratio scores for the given daily assets.
 * @param {Object} assetCandlesMap  { 'BTC': candles[], 'ETH': candles[], ... }
 * @returns {{ pairs: Array, dominance: Object }}
 */
export function computeRatios(assetCandlesMap) {
  const names = Object.keys(assetCandlesMap);
  if (names.length < 2) return { pairs: [], dominance: {} };

  const volatilities = {};
  for (const name of names) {
    volatilities[name] = computeVolatility(assetCandlesMap[name]);
  }

  const pairs = [];

  for (let i = 0; i < names.length; i++) {
    for (let j = 0; j < names.length; j++) {
      if (i === j) continue;
      const numerator = names[i];
      const denominator = names[j];

      const ratioCandles = buildRatioCandles(
        assetCandlesMap[numerator],
        assetCandlesMap[denominator]
      );

      if (ratioCandles.length < 50) continue;

      try {
        const { indicatorResults, compositeScores, signals } = runStrategy(ratioCandles, MTTI_OTHERS_PARAMS);
        const lastScore = compositeScores[compositeScores.length - 1];
        const lastSignal = signals[signals.length - 1];

        const returns = dailyLogReturns(ratioCandles);
        const sharpe = computeSharpe(returns);
        const sortino = computeSortino(returns);
        const omega = computeOmega(returns);

        pairs.push({
          numerator,
          denominator,
          label: `${numerator}/${denominator}`,
          score: lastScore,
          signal: lastSignal,
          volNumerator: volatilities[numerator],
          volDenominator: volatilities[denominator],
          sharpe,
          sortino,
          omega,
          candles: ratioCandles,
          compositeScores,
          signals,
          indicatorResults,
        });
      } catch (err) {
        console.warn(`Ratio ${numerator}/${denominator} failed: ${err.message}`);
      }
    }
  }

  const dominance = {};
  for (const name of names) {
    dominance[name] = { wins: 0, losses: 0, neutral: 0, score: 0 };
  }

  for (const p of pairs) {
    if (p.signal === 'LONG') {
      dominance[p.numerator].wins++;
      dominance[p.denominator].losses++;
    } else if (p.signal === 'CASH') {
      dominance[p.numerator].losses++;
      dominance[p.denominator].wins++;
    } else {
      dominance[p.numerator].neutral++;
      dominance[p.denominator].neutral++;
    }
    dominance[p.numerator].score += p.score;
    dominance[p.denominator].score -= p.score;
  }

  return { pairs, dominance, volatilities };
}
