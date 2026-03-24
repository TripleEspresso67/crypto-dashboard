import { ema, sma, stdev, nz } from './helpers.js';

function fourierSmooth(src, length) {
  const out = new Array(src.length).fill(NaN);
  for (let i = 0; i < src.length; i++) {
    let sum = 0;
    let wSum = 0;
    for (let j = 0; j < length; j++) {
      const w = Math.exp(-j / (length * 0.3));
      const val = (i - j >= 0) ? nz(src[i - j]) : 0;
      sum += val * w;
      wSum += w;
    }
    out[i] = wSum > 0 ? sum / wSum : NaN;
  }
  return out;
}

function adfTrendFilter(src, window) {
  if (window <= 0) return src.map(() => 1.0);
  const shortLen = Math.max(1, Math.floor(window / 3));
  const smaShort = sma(src, shortLen);
  const smaLong = sma(src, window);
  const vol = stdev(src, window);
  return src.map((_, i) => {
    const v = nz(vol[i]);
    const ts = v > 0 ? (nz(smaShort[i]) - nz(smaLong[i])) / v : 0;
    return 1.0 + Math.max(-0.1, Math.min(0.1, ts * 0.2));
  });
}

/**
 * FSVZO (Fourier-Smoothed VZO) score.
 * Used in LTTI only.
 */
export function fsvzoScore(candles, params) {
  const {
    fsvzo_length, fsvzo_signalLength, fsvzo_smoothingLength,
    fsvzo_fourierLength, fsvzo_adfWindow
  } = params;

  const close = candles.map(c => c.close);
  const vol = candles.map(c => c.volume);

  const adfTrend = fsvzo_adfWindow > 10 ? adfTrendFilter(close, fsvzo_adfWindow) : close.map(() => 1.0);

  const relVolume = new Array(candles.length).fill(NaN);
  const volSma = sma(vol, fsvzo_length);
  for (let i = 0; i < candles.length; i++) {
    relVolume[i] = nz(volSma[i]) > 0 ? vol[i] / volSma[i] : 1;
  }
  const smoothedVol = ema(relVolume, fsvzo_smoothingLength);

  const priceChange = close.map((c, i) => i === 0 ? 0 : c - close[i - 1]);
  const smoothedChange = ema(priceChange, fsvzo_smoothingLength);

  const baseMom = new Array(candles.length).fill(0);
  const trendMom = new Array(candles.length).fill(0);
  for (let i = 0; i < candles.length; i++) {
    baseMom[i] = nz(smoothedChange[i]) * nz(smoothedVol[i]);
    trendMom[i] = baseMom[i] * nz(adfTrend[i], 1);
  }
  const baseMomEma = ema(baseMom, fsvzo_smoothingLength);
  const trendMomEma = ema(trendMom, fsvzo_smoothingLength);

  const momentum = baseMomEma.map((v, i) => nz(v) * 0.7 + nz(trendMomEma[i]) * 0.3);

  const posMom = momentum.map(m => Math.max(m, 0));
  const negMom = momentum.map(m => Math.abs(Math.min(m, 0)));
  const posMomEma = ema(posMom, fsvzo_length);
  const negMomEma = ema(negMom, fsvzo_length);

  const vzoRaw = posMomEma.map((p, i) => {
    const n = nz(negMomEma[i]);
    const ratio = n > 0.00001 ? p / n : p > 0.00001 ? 100 : 1;
    return 100 * (ratio - 1) / (ratio + 1);
  });

  const vzoEma = ema(vzoRaw, fsvzo_smoothingLength);
  const vzoFourier = fsvzo_fourierLength >= 5
    ? fourierSmooth(vzoRaw, fsvzo_fourierLength)
    : vzoEma;

  const finalVzo = fsvzo_fourierLength >= 5
    ? vzoEma.map((v, i) => Math.min(Math.max(nz(v) * 0.6 + nz(vzoFourier[i]) * 0.4, -100), 100))
    : vzoEma.map(v => Math.min(Math.max(nz(v), -100), 100));

  const scores = new Array(candles.length).fill(0);
  const lastChanged = new Array(candles.length).fill(NaN);

  let bull = false;
  let lastChg = NaN;

  for (let i = 0; i < candles.length; i++) {
    const v = finalVzo[i];
    if (isNaN(v)) { scores[i] = bull ? 1 : -1; lastChanged[i] = lastChg; continue; }

    const vzoRising = i > 0 ? v > nz(finalVzo[i - 1]) : false;
    const prevRising = i > 1 ? nz(finalVzo[i - 1]) > nz(finalVzo[i - 2]) : false;

    const flipBull = vzoRising && !prevRising;
    const flipBear = !vzoRising && prevRising;

    if (i === 0) bull = vzoRising;
    if (flipBull) bull = true;
    if (flipBear) bull = false;

    const s = bull ? 1 : -1;
    if (i > 0 && s !== scores[i - 1]) lastChg = candles[i].time;
    scores[i] = s;
    lastChanged[i] = lastChg;
  }

  return { scores, lastChanged, name: 'FSVZO' };
}
