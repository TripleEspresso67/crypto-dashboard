/**
 * Shared Technical Analysis helper functions.
 * All functions operate on arrays of numbers and return arrays of the same length,
 * with NaN in positions where there is insufficient data.
 */

export function sma(src, len) {
  const out = new Array(src.length).fill(NaN);
  if (len < 1) return out;
  for (let i = len - 1; i < src.length; i++) {
    let sum = 0;
    let valid = true;
    for (let j = 0; j < len; j++) {
      if (isNaN(src[i - j])) { valid = false; break; }
      sum += src[i - j];
    }
    if (valid) out[i] = sum / len;
  }
  return out;
}

export function ema(src, len) {
  const out = new Array(src.length).fill(NaN);
  if (len < 1 || src.length === 0) return out;
  const alpha = 2 / (len + 1);
  let prev = NaN;
  for (let i = 0; i < src.length; i++) {
    if (isNaN(prev)) {
      prev = src[i];
    } else {
      prev = alpha * src[i] + (1 - alpha) * prev;
    }
    out[i] = prev;
  }
  return out;
}

export function rma(src, len) {
  const out = new Array(src.length).fill(NaN);
  if (len < 1 || src.length === 0) return out;
  const alpha = 1 / len;

  // Pine Script ta.rma seeds with SMA of first `len` non-NaN values
  let seedSum = 0;
  let seedCount = 0;
  let seedIdx = -1;
  for (let i = 0; i < src.length; i++) {
    if (!isNaN(src[i])) {
      seedSum += src[i];
      seedCount++;
      if (seedCount === len) {
        seedIdx = i;
        break;
      }
    }
  }

  if (seedIdx === -1) return out;

  let prev = seedSum / len;
  out[seedIdx] = prev;

  for (let i = seedIdx + 1; i < src.length; i++) {
    const val = isNaN(src[i]) ? 0 : src[i];
    prev = alpha * val + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

export function wma(src, len) {
  const out = new Array(src.length).fill(NaN);
  if (len < 1) return out;
  for (let i = len - 1; i < src.length; i++) {
    let wSum = 0;
    let wDiv = 0;
    for (let j = 0; j < len; j++) {
      const w = len - j;
      wSum += src[i - j] * w;
      wDiv += w;
    }
    out[i] = wSum / wDiv;
  }
  return out;
}

export function vwma(src, vol, len) {
  const out = new Array(src.length).fill(NaN);
  if (len < 1) return out;
  for (let i = len - 1; i < src.length; i++) {
    let pvSum = 0;
    let vSum = 0;
    for (let j = 0; j < len; j++) {
      pvSum += src[i - j] * vol[i - j];
      vSum += vol[i - j];
    }
    out[i] = vSum !== 0 ? pvSum / vSum : NaN;
  }
  return out;
}

export function dema(src, len) {
  const e1 = ema(src, len);
  const e2 = ema(e1, len);
  return src.map((_, i) => 2 * e1[i] - e2[i]);
}

export function hma(src, len) {
  const halfLen = Math.max(Math.floor(len / 2), 1);
  const sqrtLen = Math.max(Math.round(Math.sqrt(len)), 1);
  const w1 = wma(src, halfLen);
  const w2 = wma(src, len);
  const diff = w1.map((v, i) => 2 * v - w2[i]);
  return wma(diff, sqrtLen);
}

export function trima(src, len) {
  const L = Math.max(len, 1);
  const len1 = Math.ceil(L / 2);
  const len2 = Math.floor(L / 2) + 1;
  return sma(sma(src, len1), len2);
}

export function atr(high, low, close, len) {
  const tr = new Array(close.length).fill(NaN);
  for (let i = 0; i < close.length; i++) {
    if (i === 0) {
      tr[i] = high[i] - low[i];
    } else {
      tr[i] = Math.max(
        high[i] - low[i],
        Math.abs(high[i] - close[i - 1]),
        Math.abs(low[i] - close[i - 1])
      );
    }
  }
  return rma(tr, len);
}

export function stdev(src, len) {
  const out = new Array(src.length).fill(NaN);
  if (len < 1) return out;
  for (let i = len - 1; i < src.length; i++) {
    let sum = 0;
    for (let j = 0; j < len; j++) sum += src[i - j];
    const mean = sum / len;
    let sqSum = 0;
    for (let j = 0; j < len; j++) sqSum += (src[i - j] - mean) ** 2;
    out[i] = Math.sqrt(sqSum / len);
  }
  return out;
}

export function median(src, len) {
  const out = new Array(src.length).fill(NaN);
  if (len < 1) return out;
  for (let i = len - 1; i < src.length; i++) {
    const window = [];
    for (let j = 0; j < len; j++) window.push(src[i - j]);
    window.sort((a, b) => a - b);
    // Pine Script ta.median: for even-length, returns the lower of two middle values
    const mid = Math.floor(window.length / 2);
    out[i] = window.length % 2 !== 0 ? window[mid] : window[mid - 1];
  }
  return out;
}

export function percentileNearestRank(src, len, pct) {
  const out = new Array(src.length).fill(NaN);
  if (len < 1) return out;
  for (let i = len - 1; i < src.length; i++) {
    const window = [];
    for (let j = 0; j < len; j++) window.push(src[i - j]);
    window.sort((a, b) => a - b);
    const rank = Math.ceil((pct / 100) * window.length) - 1;
    out[i] = window[Math.max(0, Math.min(rank, window.length - 1))];
  }
  return out;
}

export function gaussianFilter(src, length, sigma) {
  const out = new Array(src.length).fill(NaN);
  // Pine starts from bar 0, using nz() (= 0) for out-of-bounds historical values
  for (let i = 0; i < src.length; i++) {
    let gSum = 0;
    let gWSum = 0;
    for (let j = 0; j < length; j++) {
      const w = Math.exp(-0.5 * ((j - (length - 1) / 2) / sigma) ** 2);
      gSum += w;
      const val = (i - j >= 0) ? src[i - j] : 0;
      gWSum += (isNaN(val) ? 0 : val) * w;
    }
    out[i] = gWSum / gSum;
  }
  return out;
}

export function change(src) {
  const out = new Array(src.length).fill(NaN);
  for (let i = 1; i < src.length; i++) {
    out[i] = src[i] - src[i - 1];
  }
  return out;
}

export function crossover(a, b) {
  const out = new Array(a.length).fill(false);
  for (let i = 1; i < a.length; i++) {
    out[i] = a[i] > b[i] && a[i - 1] <= b[i - 1];
  }
  return out;
}

export function crossunder(a, b) {
  const out = new Array(a.length).fill(false);
  for (let i = 1; i < a.length; i++) {
    out[i] = a[i] < b[i] && a[i - 1] >= b[i - 1];
  }
  return out;
}

export function sumArray(src, len) {
  const out = new Array(src.length).fill(NaN);
  if (len < 1) return out;
  for (let i = len - 1; i < src.length; i++) {
    let s = 0;
    let valid = true;
    for (let j = 0; j < len; j++) {
      if (isNaN(src[i - j])) { valid = false; break; }
      s += src[i - j];
    }
    if (valid) out[i] = s;
  }
  return out;
}

export function rsi(src, len) {
  const chg = change(src);
  const gains = chg.map(v => Math.max(v, 0));
  const losses = chg.map(v => -Math.min(v, 0));
  const avgGain = rma(gains, len);
  const avgLoss = rma(losses, len);
  return avgGain.map((up, i) => {
    const down = avgLoss[i];
    if (isNaN(up) || isNaN(down)) return NaN;
    if (down === 0) return 100;
    if (up === 0) return 0;
    return 100 - 100 / (1 + up / down);
  });
}

export function hlcc4(candles) {
  return candles.map(c => (c.high + c.low + c.close + c.close) / 4);
}

export function nz(val, fallback = 0) {
  return (val === undefined || val === null || isNaN(val)) ? fallback : val;
}
