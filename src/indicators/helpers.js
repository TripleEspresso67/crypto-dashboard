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

export function hma(src, len) {
  const halfLen = Math.max(Math.floor(len / 2), 1);
  const sqrtLen = Math.max(Math.round(Math.sqrt(len)), 1);
  const w1 = wma(src, halfLen);
  const w2 = wma(src, len);
  const diff = w1.map((v, i) => 2 * v - w2[i]);
  return wma(diff, sqrtLen);
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

export function nz(val, fallback = 0) {
  return (val === undefined || val === null || isNaN(val)) ? fallback : val;
}
