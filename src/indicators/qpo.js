import { sma, atr, nz } from './helpers.js';

/**
 * Quantum Probability Oscillator (QPO) score.
 * Used in LTTI only.
 */
export function qpoScore(candles, params) {
  const { qpo_length, qpo_smooth, qpo_atrLength, qpo_atrMult, qpo_trendThresholdPct } = params;

  const close = candles.map(c => c.close);
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);

  const delta = close.map((c, i) => i === 0 ? 0 : c - close[i - 1]);
  const prob = delta.map(d => 1 / (1 + Math.abs(d)));
  const probSmooth = sma(prob, qpo_smooth);
  const trend = sma(delta, qpo_smooth);

  const atrVals = atr(high, low, close, qpo_atrLength);

  const probSma = sma(probSmooth, qpo_length);

  const scores = new Array(candles.length).fill(0);
  const lastChanged = new Array(candles.length).fill(NaN);

  let medQ = 0;
  let lastChg = NaN;

  for (let i = 0; i < candles.length; i++) {
    const c = close[i];
    const t = nz(trend[i]);
    const ps = nz(probSmooth[i]);
    const psma = nz(probSma[i]);
    const d = delta[i];
    const a = nz(atrVals[i]);

    if (isNaN(trend[i]) || isNaN(probSma[i]) || isNaN(atrVals[i])) {
      scores[i] = medQ;
      lastChanged[i] = lastChg;
      continue;
    }

    const minMove = qpo_atrMult * a;
    const trendPct = c !== 0 ? (100 * t / c) : 0;

    const longSig = t > 0 && ps < psma && d > minMove && trendPct > qpo_trendThresholdPct;
    const shortSig = t < 0 && ps < psma && d < -minMove && trendPct < -qpo_trendThresholdPct;

    if (longSig) medQ = 1;
    else if (shortSig) medQ = -1;

    if (i > 0 && medQ !== scores[i - 1]) lastChg = candles[i].time;
    scores[i] = medQ;
    lastChanged[i] = lastChg;
  }

  return { scores, lastChanged, name: 'QPO' };
}
