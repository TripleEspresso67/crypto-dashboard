import { ema, atr, rsi as rsiCalc, sma, gaussianFilter, median, nz, crossover, crossunder } from './helpers.js';

/**
 * Impulsive Momentum (SandiB) score.
 * Combines Base EMA, Momentum EMA, MAD, and optional RSI into a composite signal.
 */
export function impulsiveMomentumScore(candles, params) {
  const {
    im_lenEMA_base, im_atrMult_base, im_atrLen_base,
    im_lenEMA_mom, im_atrLen_mom, im_atrMult_mom,
    im_lenMED, im_madMult,
    im_rsiLen, im_rsiSmaLen,
    im_Lu, im_Su, im_useRSI
  } = params;

  const close = candles.map(c => c.close);
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);

  const gSmooth = gaussianFilter(close, 4, 2.0);
  const emaBase = ema(gSmooth, im_lenEMA_base);
  const atrBase = atr(high, low, close, im_atrLen_base);

  const emaMom = ema(gSmooth, im_lenEMA_mom);
  const atrMom = atr(high, low, close, im_atrLen_mom);

  const med28 = median(close, 28);
  const medN = median(close, im_lenMED);
  const absDevs = close.map((c, i) => isNaN(medN[i]) ? NaN : Math.abs(c - medN[i]));
  const madVal = median(absDevs, im_lenMED);

  const rsiVals = rsiCalc(close, im_rsiLen);
  const rsiSma = sma(rsiVals, im_rsiSmaLen);

  const scores = new Array(candles.length).fill(0);
  const lastChanged = new Array(candles.length).fill(NaN);

  let B1 = 0, B2 = 0, dir = 0;
  let lastChg = NaN;

  for (let i = 0; i < candles.length; i++) {
    const c = close[i];
    const eb = nz(emaBase[i]);
    const ab = nz(atrBase[i]);
    const em = nz(emaMom[i]);
    const am = nz(atrMom[i]);

    if (isNaN(emaBase[i])) { scores[i] = 0; lastChanged[i] = lastChg; continue; }

    // Base
    const longBase = c > eb + ab * im_atrMult_base;
    const shortBase = c < eb - ab * im_atrMult_base;
    if (longBase && !shortBase) B1 = 1;
    if (shortBase) B1 = -1;

    // Momentum EMA
    const longMom = c > em + am * im_atrMult_mom;
    const shortMom = c < em - am * im_atrMult_mom;
    const p1 = em + am * 1.3;
    if (longMom && !shortMom) B2 = 1;
    if (shortMom) B2 = -1;

    const M1 = (B2 > 0 && c > p1) ? 1 : -1;

    // MAD base momentum
    const m28 = nz(med28[i]);
    const mv = nz(madVal[i]);
    const medP = m28 + mv * im_madMult;
    const medM = m28 - mv * im_madMult;

    if (i > 0) {
      const prevC = close[i - 1];
      const prevMedP = nz(med28[i - 1]) + nz(madVal[i - 1]) * im_madMult;
      const prevMedM = nz(med28[i - 1]) - nz(madVal[i - 1]) * im_madMult;
      if (prevC <= prevMedP && c > medP) dir = 1;
      if (prevC >= prevMedM && c < medM) dir = -1;
    }

    const M2 = (dir > 0 && c > medP) ? 1 : -1;

    const MR = (!isNaN(rsiVals[i]) && !isNaN(rsiSma[i]) && rsiVals[i] > rsiSma[i]) ? 1 : -1;

    const baseTrend = dir + B1;
    const baseMomentum = (M1 + M2) / 2;
    const MSig = baseMomentum > 0 ? 1 : baseMomentum < 0 ? -1 : 0;
    const baseMomentum2 = (B2 + dir) / 2;
    const MSig2 = baseMomentum2 > 0 ? 1 : baseMomentum2 < 0 ? -1 : 0;

    const finalSig = im_useRSI
      ? (MSig + MSig2 + baseTrend + MR)
      : (MSig + MSig2 + baseTrend);

    const s = finalSig > im_Lu ? 1 : finalSig < im_Su ? -1 : 0;

    if (i > 0 && s !== scores[i - 1]) lastChg = candles[i].time;
    scores[i] = s;
    lastChanged[i] = lastChg;
  }

  return { scores, lastChanged, name: 'Impulsive' };
}
