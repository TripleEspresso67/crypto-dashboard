import { ema, vwma, nz } from './helpers.js';

function volumeWeightedStdev(src, vol, length) {
  const mean = vwma(src, vol, length);
  const out = new Array(src.length).fill(NaN);
  for (let i = length - 1; i < src.length; i++) {
    let sumSq = 0;
    let volSum = 0;
    for (let j = 0; j < length; j++) {
      const diff = src[i - j] - nz(mean[i]);
      sumSq += vol[i - j] * diff * diff;
      volSum += vol[i - j];
    }
    out[i] = volSum > 0 ? Math.sqrt(sumSq / volSum) : 0;
  }
  return out;
}

/**
 * SmartVol SuperTrend (Oquant) score.
 */
export function smartVolSuperTrendScore(candles, params) {
  const { sv_emalen, sv_vwsdlen, sv_factor } = params;

  const src = candles.map(c => c.close);
  const vol = candles.map(c => c.volume);
  const close = candles.map(c => c.close);

  const srcEma = ema(src, sv_emalen);
  const vwsd = volumeWeightedStdev(src, vol, sv_vwsdlen);

  const scores = new Array(candles.length).fill(0);
  const lastChanged = new Array(candles.length).fill(NaN);

  let prevLowerBand = 0, prevUpperBand = Infinity;
  let dir = 1;
  let superTrend = 0;
  let score = 0;
  let lastChg = NaN;

  for (let i = 0; i < candles.length; i++) {
    const c = close[i];
    const s = nz(srcEma[i]);
    const v = nz(vwsd[i]);

    if (isNaN(srcEma[i]) || isNaN(vwsd[i])) {
      scores[i] = score;
      lastChanged[i] = lastChg;
      continue;
    }

    let upperBand = s + sv_factor * v;
    let lowerBand = s - sv_factor * v;

    const prevC = i > 0 ? close[i - 1] : c;

    lowerBand = (lowerBand > prevLowerBand || prevC < prevLowerBand) ? lowerBand : prevLowerBand;
    upperBand = (upperBand < prevUpperBand || prevC > prevUpperBand) ? upperBand : prevUpperBand;

    const prevSuperTrend = superTrend;

    if (i === 0 || isNaN(vwsd[i - 1])) {
      dir = 1;
    } else if (prevSuperTrend === prevUpperBand) {
      dir = c > upperBand ? -1 : 1;
    } else {
      dir = c < lowerBand ? 1 : -1;
    }

    superTrend = dir === -1 ? lowerBand : upperBand;

    const isLong = dir < 0;
    const isShort = dir > 0;

    if (isLong && !isShort) score = 1;
    else if (isShort) score = -1;

    if (i > 0 && score !== scores[i - 1]) lastChg = candles[i].time;
    scores[i] = score;
    lastChanged[i] = lastChg;

    prevLowerBand = lowerBand;
    prevUpperBand = upperBand;
  }

  return { scores, lastChanged, name: 'SmartVol ST' };
}
