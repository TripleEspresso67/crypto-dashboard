import { ema, sma, wma, rma, vwma, hma, nz } from './helpers.js';

function alma(src, len) {
  const out = new Array(src.length).fill(NaN);
  const offset = 0.85;
  const sigma = 6;
  for (let i = len - 1; i < src.length; i++) {
    const m = offset * (len - 1);
    const s = len / sigma;
    let wSum = 0;
    let norm = 0;
    for (let j = 0; j < len; j++) {
      const w = Math.exp(-((j - m) ** 2) / (2 * s * s));
      wSum += src[i - (len - 1 - j)] * w;
      norm += w;
    }
    out[i] = norm > 0 ? wSum / norm : NaN;
  }
  return out;
}

/**
 * MAD ForLoop (CharonQuant) score.
 * Used in LTTI only.
 */
export function madForLoopScore(candles, params) {
  const { mad_ma_type, mad_ma_len, mad_from, mad_to, mad_len } = params;

  const close = candles.map(c => c.close);
  const vol = candles.map(c => c.volume);

  let maArr;
  switch (mad_ma_type) {
    case 'SMA': maArr = sma(close, mad_ma_len); break;
    case 'WMA': maArr = wma(close, mad_ma_len); break;
    case 'RMA': maArr = rma(close, mad_ma_len); break;
    case 'VWMA': maArr = vwma(close, vol, mad_ma_len); break;
    case 'HMA': maArr = hma(close, mad_ma_len); break;
    case 'ALMA': maArr = alma(close, mad_ma_len); break;
    default: maArr = ema(close, mad_ma_len); break;
  }

  const loopArr = new Array(candles.length).fill(0);
  for (let idx = 0; idx < candles.length; idx++) {
    if (idx < mad_to) { loopArr[idx] = 0; continue; }
    let sum = 0;
    for (let j = mad_from; j <= mad_to; j++) {
      if ((idx - j) >= 0 && !isNaN(maArr[idx]) && !isNaN(maArr[idx - j])) {
        sum += maArr[idx] > maArr[idx - j] ? 1 : -1;
      }
    }
    loopArr[idx] = sum;
  }

  const meanLoop = sma(loopArr, mad_len);
  const absDev = loopArr.map((v, i) => Math.abs(v - nz(meanLoop[i])));
  const madDev = sma(absDev, mad_len);

  const upper = loopArr.map((v, i) => v + nz(madDev[i]));
  const lower = loopArr.map((v, i) => v - nz(madDev[i]));

  const scores = new Array(candles.length).fill(0);
  const lastChanged = new Array(candles.length).fill(NaN);

  let state = 0;
  let lastChg = NaN;

  for (let i = 0; i < candles.length; i++) {
    const longCond = lower[i] > 0;
    const shortCond = upper[i] < 0;

    if (longCond && !shortCond) state = 1;
    if (shortCond) state = -1;

    if (i > 0 && state !== scores[i - 1]) lastChg = candles[i].time;
    scores[i] = state;
    lastChanged[i] = lastChg;
  }

  return { scores, lastChanged, name: 'MAD ForLoop' };
}
