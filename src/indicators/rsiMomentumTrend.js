import { rsi as rsiCalc, ema, change } from './helpers.js';

/**
 * RSI Momentum Trend score.
 * State-based: flips to +1 on momentum cross-up, -1 on cross-down.
 */
export function rsiMomentumTrendScore(candles, params) {
  const { rmt_Len2, rmt_pmom, rmt_nmom } = params;
  const close = candles.map(c => c.close);
  const rsiVals = rsiCalc(close, rmt_Len2);
  const ema5 = ema(close, 5);
  const ema5Chg = change(ema5);

  const scores = new Array(candles.length).fill(0);
  const lastChanged = new Array(candles.length).fill(NaN);

  let positive = false;
  let negative = false;
  let lastChg = NaN;

  for (let i = 1; i < candles.length; i++) {
    const r = rsiVals[i];
    const rPrev = rsiVals[i - 1];
    const ec = ema5Chg[i];

    if (isNaN(r) || isNaN(rPrev) || isNaN(ec)) {
      scores[i] = scores[i - 1];
      lastChanged[i] = lastChg;
      continue;
    }

    const pMom = rPrev < rmt_pmom && r > rmt_pmom && r > rmt_nmom && ec > 0;
    const nMom = r < rmt_nmom && ec < 0;

    if (pMom) { positive = true; negative = false; }
    if (nMom) { positive = false; negative = true; }

    const s = positive ? 1 : negative ? -1 : 0;
    if (s !== scores[i - 1]) lastChg = candles[i].time;
    scores[i] = s;
    lastChanged[i] = lastChg;
  }

  return { scores, lastChanged, name: 'RSI Momentum' };
}
