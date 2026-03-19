import { rsi as rsiCalc, ema, nz } from './helpers.js';

/**
 * RSI (EMA-smoothed) indicator score.
 * Pine: rsiEma > 51 => +1, rsiEma < 49 => -1, else 0
 */
export function rsiScore(candles, params) {
  const { rsiLength, rsiSource, rsiEmaLen } = params;
  const src = candles.map(c => c[rsiSource || 'close']);
  const rsiVals = rsiCalc(src, rsiLength);
  const rsiEma = ema(rsiVals, rsiEmaLen);

  const scores = new Array(candles.length).fill(0);
  const lastChanged = new Array(candles.length).fill(NaN);

  for (let i = 0; i < candles.length; i++) {
    const v = rsiEma[i];
    if (isNaN(v)) { scores[i] = 0; continue; }
    scores[i] = v > 51 ? 1 : v < 49 ? -1 : 0;
  }

  let lastChg = NaN;
  for (let i = 1; i < candles.length; i++) {
    if (scores[i] !== scores[i - 1]) lastChg = candles[i].time;
    lastChanged[i] = lastChg;
  }

  return { scores, lastChanged, name: 'RSI' };
}
