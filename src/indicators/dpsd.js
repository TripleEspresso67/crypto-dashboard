import { ema, percentileNearestRank, stdev, nz } from './helpers.js';

/**
 * DPSD (DEMA Percentile Standard Deviation) score.
 * Score is based on sign of PT value.
 */
export function dpsdScore(candles, params) {
  const {
    dpsd_DemaLen, dpsd_DemaSrc,
    dpsd_PerLen, dpsd_perUp, dpsd_perDown,
    dpsd_SDlen, dpsd_EmaLen
  } = params;

  const src = candles.map(c => c[dpsd_DemaSrc || 'open']);
  const close = candles.map(c => c.close);

  const ema1 = ema(src, dpsd_DemaLen);
  const ema2 = ema(ema1, dpsd_DemaLen);
  const demaArr = ema1.map((v, i) => 2 * v - ema2[i]);

  const perUp = percentileNearestRank(demaArr, dpsd_PerLen, dpsd_perUp);
  const perDown = percentileNearestRank(demaArr, dpsd_PerLen, dpsd_perDown);

  const sdArr = stdev(perDown, dpsd_SDlen);

  const scores = new Array(candles.length).fill(0);
  const lastChanged = new Array(candles.length).fill(NaN);

  let T = 0;
  let lastChg = NaN;

  for (let i = 0; i < candles.length; i++) {
    const c = close[i];
    const pu = nz(perUp[i]);
    const pd = nz(perDown[i]);
    const sd = nz(sdArr[i]);

    if (isNaN(perUp[i]) || isNaN(perDown[i])) {
      scores[i] = 0;
      lastChanged[i] = lastChg;
      continue;
    }

    const sdl = pd + sd;
    const SDL = c > sdl;

    const Lsig = c > pu && SDL;
    const Ssig = c < pd;

    if (Lsig) T = 1;
    if (Ssig) T = -1;

    const PT = T === 1 ? c - pd : (pu > sdl ? c - pu : c - sdl);
    const s = PT > 0 ? 1 : PT < 0 ? -1 : 0;

    if (i > 0 && s !== scores[i - 1]) lastChg = candles[i].time;
    scores[i] = s;
    lastChanged[i] = lastChg;
  }

  return { scores, lastChanged, name: 'DEMA PSD' };
}
