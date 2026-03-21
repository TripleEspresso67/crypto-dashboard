import { ema, sma, wma, vwma, dema, trima, nz } from './helpers.js';

/**
 * STOCH ForLoop indicator score.
 * For each length in [a..b], compute stochastic per bar, apply %K and %D
 * smoothing, score each, then average all scores and smooth with MA.
 *
 * Matches Pine Script's bar-by-bar stochastic with historical smoothing.
 */
export function stochForLoopScore(candles, params) {
  const {
    st_smoothK, st_periodD, st_scoreBy,
    st_a, st_b, st_maType, st_maLen,
    st_sigmode, st_longth, st_shortth, st_fastth
  } = params;

  const close = candles.map(c => c.close);
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const vol = candles.map(c => c.volume);
  const barCount = candles.length;

  const a = Math.min(st_a, st_b);
  const b = Math.max(st_a, st_b);
  const n = b - a + 1;
  const kLen = Math.max(st_smoothK, 1);
  const dLen = Math.max(st_periodD, 1);

  const avgArr = new Array(barCount).fill(0);

  for (let x = 0; x < n; x++) {
    const len = a + x;

    // Step 1: Compute raw stochastic for all bars at this length
    const stochRaw = new Array(barCount).fill(0);
    for (let idx = 0; idx < barCount; idx++) {
      const lookback = Math.min(len, idx + 1);
      let hh = high[idx];
      let ll = low[idx];
      for (let j = 1; j < lookback; j++) {
        hh = Math.max(hh, high[idx - j]);
        ll = Math.min(ll, low[idx - j]);
      }
      const denom = hh - ll;
      stochRaw[idx] = denom !== 0 ? 100 * (close[idx] - ll) / denom : 0;
    }

    // Step 2: %K smoothing — SMA of stochRaw over kLen bars
    // Pine uses nz() for out-of-bounds access (treats as 0)
    const kArr = new Array(barCount).fill(0);
    for (let idx = 0; idx < barCount; idx++) {
      let sum = 0;
      for (let j = 0; j < kLen; j++) {
        sum += idx - j >= 0 ? stochRaw[idx - j] : 0;
      }
      kArr[idx] = sum / kLen;
    }

    // Step 3: %D smoothing — SMA of %K over dLen bars
    // Pine uses nz() for out-of-bounds access (treats as 0)
    const dArr = new Array(barCount).fill(0);
    for (let idx = 0; idx < barCount; idx++) {
      let sum = 0;
      for (let j = 0; j < dLen; j++) {
        sum += idx - j >= 0 ? kArr[idx - j] : 0;
      }
      dArr[idx] = sum / dLen;
    }

    // Step 4: Score each bar and accumulate into avgArr
    // Pine: T starts at 0.0 per bar, carries over within the for loop
    // if neither condition fires. In practice k/d rarely equals exactly 50.
    for (let idx = 0; idx < barCount; idx++) {
      const k = kArr[idx];
      const d = dArr[idx];

      let T = 0;
      if (st_scoreBy === 'k > 50') {
        if (k > 50) T = 1;
        if (k < 50) T = -1;
      } else if (st_scoreBy === 'k > d') {
        if (k > d) T = 1;
        if (k < d) T = -1;
      } else {
        if (d > 50) T = 1;
        if (d < 50) T = -1;
      }

      const trend = T === 1 ? 1 : -1;
      avgArr[idx] += trend;
    }
  }

  // Compute average score across all stochastic lengths
  for (let idx = 0; idx < barCount; idx++) {
    avgArr[idx] /= n;
  }

  // Apply MA smoothing to the averaged scores
  let maArr;
  switch (st_maType) {
    case 'SMA': maArr = sma(avgArr, st_maLen); break;
    case 'WMA': maArr = wma(avgArr, st_maLen); break;
    case 'VWMA': maArr = vwma(avgArr, vol, st_maLen); break;
    case 'DEMA': maArr = dema(avgArr, st_maLen); break;
    case 'TMA': maArr = trima(avgArr, st_maLen); break;
    default: maArr = ema(avgArr, st_maLen); break;
  }

  // Generate signals from MA
  const scores = new Array(barCount).fill(0);
  const lastChanged = new Array(barCount).fill(NaN);
  let state = 0;
  let lastChg = NaN;

  for (let i = 0; i < barCount; i++) {
    const MA = nz(maArr[i]);
    const prevMA = i > 0 ? nz(maArr[i - 1]) : 0;

    if (isNaN(maArr[i])) {
      scores[i] = state;
      lastChanged[i] = lastChg;
      continue;
    }

    let bull = false, bear = false;
    if (st_sigmode === 'Slow') {
      bull = MA > 0;
      bear = MA < 0;
      state = bull ? 1 : bear ? -1 : state;
    } else if (st_sigmode === 'Fast') {
      bull = (MA > prevMA) || (MA > 0.99);
      bear = (MA < prevMA) || (MA < -0.99);
      state = bull ? 1 : bear ? -1 : state;
    } else if (st_sigmode === 'Fast Threshold') {
      bull = (MA > prevMA + st_fastth) || (MA > 0.99);
      bear = (MA < prevMA - st_fastth) || (MA < -0.99);
      state = bull ? 1 : bear ? -1 : state;
    } else {
      if (i > 0 && prevMA <= st_longth && MA > st_longth) state = 1;
      if (i > 0 && prevMA >= st_shortth && MA < st_shortth) state = -1;
    }

    const s = state > 0 ? 1 : state < 0 ? -1 : 0;
    if (i > 0 && s !== scores[i - 1]) lastChg = candles[i].time;
    scores[i] = s;
    lastChanged[i] = lastChg;
  }

  return { scores, lastChanged, name: 'STOCH ForLoop' };
}
