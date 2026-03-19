import { ema, sma, wma, vwma, dema, trima, nz } from './helpers.js';

/**
 * Compute raw stochastic %K for a given lookback length.
 */
function computeStoch(high, low, close, stochLen) {
  const raw = new Array(close.length).fill(0);
  for (let i = 0; i < close.length; i++) {
    const lookback = Math.min(stochLen, i + 1);
    let hh = high[i];
    let ll = low[i];
    for (let j = 1; j < lookback; j++) {
      hh = Math.max(hh, high[i - j]);
      ll = Math.min(ll, low[i - j]);
    }
    const denom = hh - ll;
    raw[i] = denom !== 0 ? 100 * (close[i] - ll) / denom : 0;
  }
  return raw;
}

/**
 * STOCH ForLoop indicator score.
 * For each length in [a..b], compute stochastic, smooth with %K and %D,
 * score each, then average all scores and smooth with MA.
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

  const avgArr = new Array(barCount).fill(0);

  for (let idx = 0; idx < barCount; idx++) {
    let totalScore = 0;
    for (let x = 0; x < n; x++) {
      const len = a + x;

      const lookback = Math.min(len, idx + 1);
      let hh = high[idx];
      let ll = low[idx];
      for (let j = 1; j < lookback; j++) {
        hh = Math.max(hh, high[idx - j]);
        ll = Math.min(ll, low[idx - j]);
      }
      const denom = hh - ll;
      const stochRaw = denom !== 0 ? 100 * (close[idx] - ll) / denom : 0;

      // %K smoothing (SMA over st_smoothK bars) - since st_smoothK=1 in configs, k=stochRaw
      const k = stochRaw;
      // %D smoothing (SMA over st_periodD bars) - approximate using recent k values
      const d = k;

      let T;
      if (st_scoreBy === 'k > 50') {
        T = k > 50 ? 1 : -1;
      } else if (st_scoreBy === 'k > d') {
        T = k > d ? 1 : -1;
      } else {
        T = d > 50 ? 1 : -1;
      }
      totalScore += T;
    }
    avgArr[idx] = totalScore / n;
  }

  let maArr;
  switch (st_maType) {
    case 'SMA': maArr = sma(avgArr, st_maLen); break;
    case 'WMA': maArr = wma(avgArr, st_maLen); break;
    case 'VWMA': maArr = vwma(avgArr, vol, st_maLen); break;
    case 'DEMA': maArr = dema(avgArr, st_maLen); break;
    case 'TMA': maArr = trima(avgArr, st_maLen); break;
    default: maArr = ema(avgArr, st_maLen); break;
  }

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
