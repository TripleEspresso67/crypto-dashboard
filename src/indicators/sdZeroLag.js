import { ema, stdev, nz, hlcc4 as hlcc4Fn } from './helpers.js';

function zlagdema(src, len) {
  const e1 = ema(src, len);
  const e2 = ema(e1, len);
  const d1 = e1.map((v, i) => 2 * v - e2[i]);
  const e3 = ema(d1, len);
  const e4 = ema(e3, len);
  return e3.map((v, i) => 2 * v - e4[i]);
}

function zlagma(src, len) {
  const alpha = 2 / (1 + len);
  const per = Math.ceil((len - 1) / 2);
  const out = new Array(src.length).fill(NaN);
  for (let i = 0; i < src.length; i++) {
    const prev = i > 0 ? nz(out[i - 1]) : 0;
    const perVal = i >= per ? nz(out[i - per]) : 0;
    out[i] = prev + alpha * (2 * src[i] - perVal - prev);
  }
  return out;
}

function zlagtema(src, len) {
  const e1 = ema(src, len);
  const e2 = ema(e1, len);
  const e3 = ema(e2, len);
  const out1 = e1.map((v, i) => 3 * (v - e2[i]) + e3[i]);
  const e1a = ema(out1, len);
  const e2a = ema(e1a, len);
  const e3a = ema(e2a, len);
  return e1a.map((v, i) => 3 * (v - e2a[i]) + e3a[i]);
}

/**
 * SD Zero Lag (The Don Killuminati) score.
 */
export function sdZeroLagScore(candles, params) {
  const { sd_len, sd_type, sd_sdLength, sd_upperSd, sd_lowerSd } = params;

  const src = hlcc4Fn(candles);
  const close = candles.map(c => c.close);

  let zlma;
  if (sd_type === 'zldema') {
    zlma = zlagdema(src, sd_len);
  } else if (sd_type === 'zlma') {
    zlma = zlagma(src, sd_len);
  } else if (sd_type === 'zltema') {
    zlma = zlagtema(src, sd_len);
  } else {
    zlma = zlagdema(src, sd_len);
  }

  const zlmaSD = stdev(zlma, sd_sdLength);

  const normalizedKijun = zlma.map((z, i) => close[i] !== 0 ? -1 * z / close[i] : 0);
  const normalizedSd = stdev(normalizedKijun, sd_sdLength);

  const scores = new Array(candles.length).fill(0);
  const lastChanged = new Array(candles.length).fill(NaN);
  let score = 0;
  let lastChg = NaN;

  for (let i = 0; i < candles.length; i++) {
    const c = close[i];
    const z = nz(zlma[i]);
    const sd = nz(zlmaSD[i]);

    if (isNaN(zlma[i]) || isNaN(zlmaSD[i])) {
      scores[i] = score;
      lastChanged[i] = lastChg;
      continue;
    }

    const upperBase = (z + sd) * sd_upperSd;
    const lowerBase = (z - sd) * sd_lowerSd;

    const baseKijunLong = c > upperBase;
    const baseKijunShort = c < lowerBase;

    const nk = nz(normalizedKijun[i]);
    const ns = nz(normalizedSd[i]);
    const lowerBound = nk - ns;

    const normLong = lowerBound > -1;
    const normShort = nk < -1;

    const isLong = baseKijunLong && normLong;
    const isShort = baseKijunShort && normShort;

    if (isLong) score = 1;
    else if (isShort) score = -1;

    if (i > 0 && score !== scores[i - 1]) lastChg = candles[i].time;
    scores[i] = score;
    lastChanged[i] = lastChg;
  }

  return { scores, lastChanged, name: 'SD Zero Lag' };
}
