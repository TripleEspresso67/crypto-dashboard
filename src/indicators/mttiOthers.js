/**
 * MTTI-others indicator suite — self-contained, line-by-line translation
 * of the Pine Script v6 "MTTI - others" indicator.
 *
 * Every helper function replicates Pine Script's ta.* behaviour exactly.
 * No shared helpers are imported; everything is internal.
 */

// ═══════════════════════════════════════════════════════════════
//  Internal Pine-faithful helpers
// ═══════════════════════════════════════════════════════════════

function _nz(val, fallback = 0) {
  return (val === undefined || val === null || Number.isNaN(val)) ? fallback : val;
}

/** ta.sma — returns NaN when any value in the window is NaN. */
function _sma(src, len) {
  const out = new Array(src.length).fill(NaN);
  for (let i = len - 1; i < src.length; i++) {
    let sum = 0;
    let ok = true;
    for (let j = 0; j < len; j++) {
      const v = src[i - j];
      if (Number.isNaN(v)) { ok = false; break; }
      sum += v;
    }
    if (ok) out[i] = sum / len;
  }
  return out;
}

/** ta.ema — seeds with first non-NaN source value (Pine behaviour). */
function _ema(src, len) {
  const out = new Array(src.length).fill(NaN);
  const k = 2 / (len + 1);
  let prev = NaN;
  for (let i = 0; i < src.length; i++) {
    if (Number.isNaN(src[i])) { prev = NaN; out[i] = NaN; continue; }
    if (Number.isNaN(prev)) {
      prev = src[i];
      out[i] = prev;
    } else {
      prev = k * src[i] + (1 - k) * prev;
      out[i] = prev;
    }
  }
  return out;
}

/** ta.rma — seeds with ta.sma of first complete window, alpha = 1/len. */
function _rma(src, len) {
  const out = new Array(src.length).fill(NaN);
  const k = 1 / len;
  let prev = NaN;
  for (let i = 0; i < src.length; i++) {
    if (Number.isNaN(prev)) {
      if (i >= len - 1) {
        let sum = 0;
        let ok = true;
        for (let j = 0; j < len; j++) {
          if (Number.isNaN(src[i - j])) { ok = false; break; }
          sum += src[i - j];
        }
        if (ok) prev = sum / len;
      }
      out[i] = prev;
    } else {
      prev = k * src[i] + (1 - k) * prev;
      out[i] = prev;
    }
  }
  return out;
}

/** ta.wma */
function _wma(src, len) {
  const out = new Array(src.length).fill(NaN);
  for (let i = len - 1; i < src.length; i++) {
    let ws = 0, wd = 0;
    for (let j = 0; j < len; j++) {
      const w = len - j;
      ws += src[i - j] * w;
      wd += w;
    }
    out[i] = ws / wd;
  }
  return out;
}

/** ta.vwma */
function _vwma(src, vol, len) {
  const out = new Array(src.length).fill(NaN);
  for (let i = len - 1; i < src.length; i++) {
    let pv = 0, vs = 0;
    for (let j = 0; j < len; j++) {
      pv += src[i - j] * vol[i - j];
      vs += vol[i - j];
    }
    out[i] = vs !== 0 ? pv / vs : NaN;
  }
  return out;
}

/** f_dema helper from Pine */
function _dema(src, len) {
  const e1 = _ema(src, len);
  const e2 = _ema(e1, len);
  return e1.map((v, i) => 2 * v - e2[i]);
}

/** f_trima / TMA via two SMAs */
function _trima(src, len) {
  const L = Math.max(len, 1);
  const l1 = Math.ceil(L / 2);
  const l2 = Math.floor(L / 2) + 1;
  return _sma(_sma(src, l1), l2);
}

/** ta.change — NaN at index 0 */
function _change(src) {
  const out = new Array(src.length).fill(NaN);
  for (let i = 1; i < src.length; i++) out[i] = src[i] - src[i - 1];
  return out;
}

/** ta.rsi */
function _rsi(src, len) {
  const chg = _change(src);
  const up = chg.map(v => Number.isNaN(v) ? NaN : Math.max(v, 0));
  const dn = chg.map(v => Number.isNaN(v) ? NaN : -Math.min(v, 0));
  const au = _rma(up, len);
  const ad = _rma(dn, len);
  return au.map((u, i) => {
    const d = ad[i];
    if (Number.isNaN(u) || Number.isNaN(d)) return NaN;
    if (d === 0) return 100;
    if (u === 0) return 0;
    return 100 - 100 / (1 + u / d);
  });
}

/** ta.atr */
function _atr(high, low, close, len) {
  const tr = new Array(close.length).fill(NaN);
  for (let i = 0; i < close.length; i++) {
    tr[i] = i === 0
      ? high[i] - low[i]
      : Math.max(high[i] - low[i],
                 Math.abs(high[i] - close[i - 1]),
                 Math.abs(low[i]  - close[i - 1]));
  }
  return _rma(tr, len);
}

/** ta.stdev (biased / population) — NaN if window contains NaN */
function _stdev(src, len) {
  const out = new Array(src.length).fill(NaN);
  for (let i = len - 1; i < src.length; i++) {
    let sum = 0, ok = true;
    for (let j = 0; j < len; j++) {
      if (Number.isNaN(src[i - j])) { ok = false; break; }
      sum += src[i - j];
    }
    if (!ok) continue;
    const mean = sum / len;
    let sq = 0;
    for (let j = 0; j < len; j++) sq += (src[i - j] - mean) ** 2;
    out[i] = Math.sqrt(sq / len);
  }
  return out;
}

/**
 * ta.percentile_nearest_rank — returns NaN if any value in the window is NaN
 * (Pine returns na when any source in the window is na).
 * rank = ceil(pct/100 * windowLen), returns sorted[rank-1]
 */
function _pnr(src, len, pct) {
  const out = new Array(src.length).fill(NaN);
  for (let i = len - 1; i < src.length; i++) {
    const w = [];
    let ok = true;
    for (let j = 0; j < len; j++) {
      const v = src[i - j];
      if (Number.isNaN(v)) { ok = false; break; }
      w.push(v);
    }
    if (!ok) continue;
    w.sort((a, b) => a - b);
    const r = Math.ceil((pct / 100) * w.length);
    out[i] = w[Math.max(0, Math.min(r - 1, w.length - 1))];
  }
  return out;
}

/** ta.median — proper statistical median (averages two central values for even length) */
function _median(src, len) {
  const out = new Array(src.length).fill(NaN);
  for (let i = len - 1; i < src.length; i++) {
    const w = [];
    let ok = true;
    for (let j = 0; j < len; j++) {
      const v = src[i - j];
      if (Number.isNaN(v)) { ok = false; break; }
      w.push(v);
    }
    if (!ok) continue;
    w.sort((a, b) => a - b);
    const mid = Math.floor(len / 2);
    out[i] = (len % 2 === 1) ? w[mid] : (w[mid - 1] + w[mid]) / 2;
  }
  return out;
}

/** Custom gaussian_filter — starts from bar 0, nz(src[i],0) for OOB */
function _gaussianFilter(src, length, sigma) {
  const out = new Array(src.length).fill(NaN);
  for (let i = 0; i < src.length; i++) {
    let gs = 0, gws = 0;
    for (let j = 0; j < length; j++) {
      const w = Math.exp(-0.5 * ((j - (length - 1) / 2) / sigma) ** 2);
      gs += w;
      const v = (i - j >= 0) ? src[i - j] : 0;
      gws += (_nz(v) ) * w;
    }
    out[i] = gws / gs;
  }
  return out;
}

/** ta.crossover(a, b) */
function _crossover(a, b) {
  const out = new Array(a.length).fill(false);
  for (let i = 1; i < a.length; i++) {
    out[i] = a[i] > b[i] && a[i - 1] <= b[i - 1];
  }
  return out;
}

/** ta.crossunder(a, b) */
function _crossunder(a, b) {
  const out = new Array(a.length).fill(false);
  for (let i = 1; i < a.length; i++) {
    out[i] = a[i] < b[i] && a[i - 1] >= b[i - 1];
  }
  return out;
}

/** math.sum(src, len) */
function _mathSum(src, len) {
  const out = new Array(src.length).fill(NaN);
  for (let i = len - 1; i < src.length; i++) {
    let s = 0;
    for (let j = 0; j < len; j++) s += src[i - j];
    out[i] = s;
  }
  return out;
}

function _hlcc4(candles) {
  return candles.map(c => (c.high + c.low + c.close + c.close) / 4);
}

// ═══════════════════════════════════════════════════════════════
//  1) RSI (EMA-smoothed) score
// ═══════════════════════════════════════════════════════════════
export function rsiScore(candles, params) {
  const { rsiLength, rsiSource, rsiEmaLen } = params;
  const src = candles.map(c => c[rsiSource || 'close']);

  const chg = _change(src);
  const up  = chg.map(v => Number.isNaN(v) ? NaN : Math.max(v, 0));
  const dn  = chg.map(v => Number.isNaN(v) ? NaN : -Math.min(v, 0));
  const avgUp = _rma(up, rsiLength);
  const avgDn = _rma(dn, rsiLength);
  const rsiArr = avgUp.map((u, i) => {
    const d = avgDn[i];
    if (Number.isNaN(u) || Number.isNaN(d)) return NaN;
    if (d === 0) return 100;
    if (u === 0) return 0;
    return 100 - 100 / (1 + u / d);
  });

  const rsiEma = _ema(rsiArr, rsiEmaLen);

  const n = candles.length;
  const scores = new Array(n).fill(0);
  const lastChanged = new Array(n).fill(NaN);
  let lastChg = NaN;

  for (let i = 0; i < n; i++) {
    const v = rsiEma[i];
    scores[i] = Number.isNaN(v) ? 0 : (v > 51 ? 1 : v < 49 ? -1 : 0);
    if (i > 0 && scores[i] !== scores[i - 1]) lastChg = candles[i].time;
    lastChanged[i] = lastChg;
  }
  return { scores, lastChanged, name: 'RSI' };
}

// ═══════════════════════════════════════════════════════════════
//  2) Impulsive Momentum (SandiB)
//  Faithful bar-by-bar translation of the Pine Script v6 indicator.
//  Each ta.* function is computed inline per bar to avoid any
//  precomputation interaction issues.
// ═══════════════════════════════════════════════════════════════
export function impulsiveMomentumScore(candles, params) {
  const {
    im_lenEMA_base, im_atrMult_base, im_atrLen_base,
    im_lenEMA_mom,  im_atrLen_mom,   im_atrMult_mom,
    im_lenMED, im_madMult,
    im_rsiLen, im_rsiSmaLen,
    im_Lu, im_Su, im_useRSI
  } = params;

  const C = candles.map(c => c.close);
  const H = candles.map(c => c.high);
  const L = candles.map(c => c.low);
  const n = candles.length;

  // ── Gaussian filter (applied to close, length=4, sigma=2.0) ──
  // Pine: gaussian_weighted_sum += src[i] * weight (no nz in SandiB original)
  // Using nz to match the MTTI strategy version: nz(src[i]) * weight
  const gSmooth = _gaussianFilter(C, 4, 2.0);

  // ── Separate EMA instances for base and momentum ──
  const EMABASE  = _ema(gSmooth, im_lenEMA_base);
  const EMABASE2 = _ema(gSmooth, im_lenEMA_mom);

  // ── ATR: Pine's ta.atr uses na(high[1]) ? H-L : max(H-L, |H-C[1]|, |L-C[1]|) ──
  const atrBase = _atr(H, L, C, im_atrLen_base);
  const atrMom  = _atr(H, L, C, im_atrLen_mom);

  // ── MAD: median, abs deviations, crossover/crossunder ──
  const medN     = _median(C, im_lenMED);
  const absDevs  = C.map((c, i) => Number.isNaN(medN[i]) ? NaN : Math.abs(c - medN[i]));
  const madVal   = _median(absDevs, im_lenMED);
  const median28 = _median(C, 28);

  const medP = median28.map((m, i) => Number.isNaN(m) || Number.isNaN(madVal[i]) ? NaN : m + madVal[i] * im_madMult);
  const medM = median28.map((m, i) => Number.isNaN(m) || Number.isNaN(madVal[i]) ? NaN : m - madVal[i] * im_madMult);
  const longM  = _crossover(C, medP);
  const shortM = _crossunder(C, medM);

  // ── RSI + SMA(RSI) ──
  const RSI  = _rsi(C, im_rsiLen);
  const RSIM = _sma(RSI, im_rsiSmaLen);

  // ── Bar-by-bar scoring (Pine var semantics) ──
  const scores      = new Array(n).fill(0);
  const lastChanged = new Array(n).fill(NaN);
  let B1 = 0, B2 = 0, dir = 0;
  let lastChg = NaN;

  for (let i = 0; i < n; i++) {
    const c  = C[i];
    const eb = EMABASE[i];
    const ab = atrBase[i];
    const em = EMABASE2[i];
    const am = atrMom[i];

    // ── EMA2(): B2 and M1 ──
    // Pine: conditions with na evaluate to false, no skip
    if (!Number.isNaN(em) && !Number.isNaN(am)) {
      const longMom  = c > em + am * im_atrMult_mom;
      const shortMom = c < em - am * im_atrMult_mom;
      if (longMom && !shortMom) B2 = 1;
      if (shortMom)             B2 = -1;
    }
    const p1 = (!Number.isNaN(em) && !Number.isNaN(am)) ? em + am * 1.3 : NaN;
    const M1 = (B2 > 0 && !Number.isNaN(p1) && c > p1) ? 1 : -1;

    // ── MAD(): dir and M2 ──
    if (longM[i])  dir = 1;
    if (shortM[i]) dir = -1;
    const mp = medP[i];
    const M2 = (dir > 0 && !Number.isNaN(mp) && c > mp) ? 1 : -1;

    // ── EMA(): B1 ──
    if (!Number.isNaN(eb) && !Number.isNaN(ab)) {
      const longBase  = c > eb + ab * im_atrMult_base;
      const shortBase = c < eb - ab * im_atrMult_base;
      if (longBase && !shortBase) B1 = 1;
      if (shortBase)              B1 = -1;
    }

    // ── RSIsig(): MR ──
    const MR = (!Number.isNaN(RSI[i]) && !Number.isNaN(RSIM[i]) && RSI[i] > RSIM[i]) ? 1 : -1;

    // ── Composite ──
    const baseTrend     = dir + B1;
    const baseMomentum  = (M1 + M2) / 2;
    const MSig          = baseMomentum > 0 ? 1 : baseMomentum < 0 ? -1 : 0;
    const baseMomentum2 = (B2 + dir) / 2;
    const MSig2         = baseMomentum2 > 0 ? 1 : baseMomentum2 < 0 ? -1 : 0;

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

// ═══════════════════════════════════════════════════════════════
//  3) SD Zero Lag (The Don Killuminati)
// ═══════════════════════════════════════════════════════════════
function _zlagdema(src, len) {
  const e1 = _ema(src, len);
  const e2 = _ema(e1, len);
  const d1 = e1.map((v, i) => 2 * v - e2[i]);
  const e3 = _ema(d1, len);
  const e4 = _ema(e3, len);
  return e3.map((v, i) => 2 * v - e4[i]);
}

function _zlagma(src, len) {
  const alpha = 2 / (1 + len);
  const per = Math.ceil((len - 1) / 2);
  const out = new Array(src.length).fill(NaN);
  for (let i = 0; i < src.length; i++) {
    const prev   = i > 0 ? _nz(out[i - 1]) : 0;
    const perVal = i >= per ? _nz(out[i - per]) : 0;
    out[i] = prev + alpha * (2 * src[i] - perVal - prev);
  }
  return out;
}

function _zlagtema(src, len) {
  const e1 = _ema(src, len);
  const e2 = _ema(e1, len);
  const e3 = _ema(e2, len);
  const o  = e1.map((v, i) => 3 * (v - e2[i]) + e3[i]);
  const a1 = _ema(o, len);
  const a2 = _ema(a1, len);
  const a3 = _ema(a2, len);
  return a1.map((v, i) => 3 * (v - a2[i]) + a3[i]);
}

export function sdZeroLagScore(candles, params) {
  const { sd_len, sd_type, sd_sdLength, sd_upperSd, sd_lowerSd, sd_src } = params;

  const close = candles.map(c => c.close);
  const src = sd_src === 'open' ? candles.map(c => c.open)
            : sd_src === 'hlcc4' ? candles.map(c => (c.high + c.low + c.close + c.close) / 4)
            : close;

  let zlma;
  if (sd_type === 'zldema')      zlma = _zlagdema(src, sd_len);
  else if (sd_type === 'zlma')   zlma = _zlagma(src, sd_len);
  else if (sd_type === 'zltema') zlma = _zlagtema(src, sd_len);
  else                           zlma = _zlagdema(src, sd_len);

  const zlmaSD       = _stdev(zlma, sd_sdLength);
  const normKijun    = zlma.map((z, i) => close[i] !== 0 ? -1 * z / close[i] : 0);
  const normSd       = _stdev(normKijun, sd_sdLength);

  const n = candles.length;
  const scores      = new Array(n).fill(0);
  const lastChanged = new Array(n).fill(NaN);
  let score = 0, lastChg = NaN;

  for (let i = 0; i < n; i++) {
    const c  = close[i];
    const z  = zlma[i];
    const sd = zlmaSD[i];

    if (Number.isNaN(z) || Number.isNaN(sd)) {
      scores[i] = score;
      lastChanged[i] = lastChg;
      continue;
    }

    const upperBase = (z + sd) * sd_upperSd;
    const lowerBase = (z - sd) * sd_lowerSd;

    const baseLong  = c > upperBase;
    const baseShort = c < lowerBase;

    const nk = _nz(normKijun[i]);
    const ns = _nz(normSd[i]);
    const lowerBound = nk - ns;

    const normLong  = lowerBound > -1;
    const normShort = nk < -1;

    const isLong  = baseLong && normLong;
    const isShort = baseShort && normShort;

    if (isLong)       score = 1;
    else if (isShort) score = -1;

    if (i > 0 && score !== scores[i - 1]) lastChg = candles[i].time;
    scores[i] = score;
    lastChanged[i] = lastChg;
  }

  return { scores, lastChanged, name: 'SD Zero Lag' };
}

// ═══════════════════════════════════════════════════════════════
//  4) DPSD
// ═══════════════════════════════════════════════════════════════
export function dpsdScore(candles, params) {
  const {
    dpsd_DemaLen, dpsd_DemaSrc,
    dpsd_PerLen, dpsd_perUp, dpsd_perDown,
    dpsd_SDlen
  } = params;

  const src   = candles.map(c => c[dpsd_DemaSrc || 'close']);
  const close = candles.map(c => c.close);

  const ema1 = _ema(src, dpsd_DemaLen);
  const ema2 = _ema(ema1, dpsd_DemaLen);
  const dema = ema1.map((v, i) => 2 * v - ema2[i]);

  const PerUp   = _pnr(dema, dpsd_PerLen, dpsd_perUp);
  const PerDown = _pnr(dema, dpsd_PerLen, dpsd_perDown);
  const sdArr   = _stdev(PerDown, dpsd_SDlen);

  const n = candles.length;
  const scores      = new Array(n).fill(0);
  const lastChanged = new Array(n).fill(NaN);
  let T = 0, lastChg = NaN;

  for (let i = 0; i < n; i++) {
    const c  = close[i];
    const pu = PerUp[i];
    const pd = PerDown[i];
    const sd = _nz(sdArr[i]);

    if (Number.isNaN(pu) || Number.isNaN(pd)) {
      scores[i] = 0;
      lastChanged[i] = lastChg;
      continue;
    }

    const sdl  = pd + sd;
    const SDL  = c > sdl;
    const Lsig = c > pu && SDL;
    const Ssig = c < pd;

    if (Lsig) T = 1;
    if (Ssig) T = -1;

    const PT = T === 1 ? c - pd : (pu > sdl ? c - pu : c - sdl);
    const s  = PT > 0 ? 1 : PT < 0 ? -1 : 0;

    if (i > 0 && s !== scores[i - 1]) lastChg = candles[i].time;
    scores[i] = s;
    lastChanged[i] = lastChg;
  }

  return { scores, lastChanged, name: 'DEMA PSD' };
}

// ═══════════════════════════════════════════════════════════════
//  5) RSI Momentum Trend
// ═══════════════════════════════════════════════════════════════
export function rsiMomentumTrendScore(candles, params) {
  const { rmt_Len2, rmt_pmom, rmt_nmom } = params;

  const C       = candles.map(c => c.close);
  const rsiArr  = _rsi(C, rmt_Len2);
  const ema5    = _ema(C, 5);
  const ema5Chg = _change(ema5);

  const n = candles.length;
  const scores      = new Array(n).fill(0);
  const lastChanged = new Array(n).fill(NaN);
  let positive = false, negative = false;
  let lastChg = NaN;

  for (let i = 1; i < n; i++) {
    const r     = rsiArr[i];
    const rPrev = rsiArr[i - 1];
    const ec    = ema5Chg[i];

    // Pine: comparisons with na return false — NaN comparisons are false in JS too
    const p_mom = rPrev < rmt_pmom && r > rmt_pmom && r > rmt_nmom && ec > 0;
    const n_mom = r < rmt_nmom && ec < 0;

    if (p_mom) { positive = true;  negative = false; }
    if (n_mom) { positive = false; negative = true;  }

    const s = positive ? 1 : negative ? -1 : 0;

    if (s !== scores[i - 1]) lastChg = candles[i].time;
    scores[i] = s;
    lastChanged[i] = lastChg;
  }

  return { scores, lastChanged, name: 'RSI Momentum' };
}

// ═══════════════════════════════════════════════════════════════
//  6) STOCH ForLoop
// ═══════════════════════════════════════════════════════════════
export function stochForLoopScore(candles, params) {
  const {
    st_smoothK, st_periodD, st_scoreBy,
    st_a, st_b, st_maType, st_maLen,
    st_sigmode, st_longth, st_shortth, st_fastth
  } = params;

  const C   = candles.map(c => c.close);
  const H   = candles.map(c => c.high);
  const L   = candles.map(c => c.low);
  const vol = candles.map(c => c.volume);
  const barCount = candles.length;

  const a = Math.min(st_a, st_b);
  const b = Math.max(st_a, st_b);
  const numLens = b - a + 1;
  const kLen = Math.max(st_smoothK, 1);
  const dLen = Math.max(st_periodD, 1);

  // Pine Script for-loop history quirk: variables computed inside a for loop
  // have their [i] history reference the value from the LAST iteration of the
  // loop on previous bars, not the same-iteration value. This means D for
  // shorter lengths uses K values from the longest length (last iteration) on
  // past bars. We replicate this by tracking stoch_raw and k history as single
  // per-bar values that get overwritten each iteration (final = last length).
  const rawHistory = new Array(barCount).fill(0);
  const kHistory   = new Array(barCount).fill(0);

  const avgArr = new Array(barCount).fill(0);
  for (let idx = 0; idx < barCount; idx++) {
    let T = 0;
    let trendSum = 0;

    for (let x = 0; x < numLens; x++) {
      const len = a + x;

      let hh = H[idx], ll = L[idx];
      for (let j = 1; j < len; j++) {
        if (idx - j >= 0) {
          hh = Math.max(hh, H[idx - j]);
          ll = Math.min(ll, L[idx - j]);
        }
      }
      const denom = hh - ll;
      const stoch_raw = denom !== 0 ? 100 * (C[idx] - ll) / denom : 0;

      // K = SMA(stoch_raw, kLen) — history references rawHistory (last iteration)
      let sumK = stoch_raw;
      for (let i = 1; i < kLen; i++) {
        sumK += (idx - i >= 0) ? rawHistory[idx - i] : 0;
      }
      const k = sumK / kLen;

      // D = SMA(k, dLen) — history references kHistory (last iteration)
      let sumD = k;
      for (let i = 1; i < dLen; i++) {
        sumD += (idx - i >= 0) ? kHistory[idx - i] : 0;
      }
      const d = sumD / dLen;

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

      trendSum += (T === 1) ? 1 : -1;

      // Overwrite history — final value after loop = last iteration (longest length)
      rawHistory[idx] = stoch_raw;
      kHistory[idx]   = k;
    }

    avgArr[idx] = trendSum / numLens;
  }

  // MA smoothing
  let maArr;
  switch (st_maType) {
    case 'SMA':  maArr = _sma(avgArr, st_maLen);  break;
    case 'WMA':  maArr = _wma(avgArr, st_maLen);  break;
    case 'VWMA': maArr = _vwma(avgArr, vol, st_maLen); break;
    case 'DEMA': maArr = _dema(avgArr, st_maLen); break;
    case 'TMA':  maArr = _trima(avgArr, st_maLen); break;
    default:     maArr = _ema(avgArr, st_maLen);  break;
  }

  // Signal generation
  const scores      = new Array(barCount).fill(0);
  const lastChanged = new Array(barCount).fill(NaN);
  let state = 0, lastChg = NaN;

  for (let i = 0; i < barCount; i++) {
    const MA     = _nz(maArr[i]);
    const prevMA = i > 0 ? _nz(maArr[i - 1]) : 0;

    if (Number.isNaN(maArr[i])) {
      scores[i] = state > 0 ? 1 : state < 0 ? -1 : 0;
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
      if (i > 0 && prevMA <= st_longth && MA > st_longth)  state = 1;
      if (i > 0 && prevMA >= st_shortth && MA < st_shortth) state = -1;
    }

    const s = state > 0 ? 1 : state < 0 ? -1 : 0;

    if (i > 0 && s !== scores[i - 1]) lastChg = candles[i].time;
    scores[i] = s;
    lastChanged[i] = lastChg;

  }

  return { scores, lastChanged, name: 'STOCH ForLoop' };
}

// ═══════════════════════════════════════════════════════════════
//  7) SmartVol SuperTrend (Oquant)
// ═══════════════════════════════════════════════════════════════
function _volumeWeightedSD(src, vol, length) {
  const mean = _vwma(src, vol, length);
  const volSum = _mathSum(vol, length);
  const out = new Array(src.length).fill(NaN);

  for (let i = length - 1; i < src.length; i++) {
    if (Number.isNaN(mean[i]) || Number.isNaN(volSum[i])) continue;
    let sq = 0;
    for (let j = 0; j < length; j++) {
      const diff = src[i - j] - mean[i];
      sq += vol[i - j] * diff * diff;
    }
    out[i] = volSum[i] > 0 ? Math.sqrt(sq / volSum[i]) : 0;
  }
  return out;
}

export function smartVolSuperTrendScore(candles, params) {
  const { sv_emalen, sv_vwsdlen, sv_factor, sv_src } = params;

  const close = candles.map(c => c.close);
  const src = sv_src === 'open' ? candles.map(c => c.open)
            : sv_src === 'hlcc4' ? candles.map(c => (c.high + c.low + c.close + c.close) / 4)
            : close;
  const vol   = candles.map(c => c.volume);
  const n     = candles.length;

  const srcEma = _ema(src, sv_emalen);
  const vwsd   = _volumeWeightedSD(src, vol, sv_vwsdlen);

  const scores      = new Array(n).fill(0);
  const lastChanged = new Array(n).fill(NaN);

  let prevLB = 0, prevUB = 0;
  let dir = 1, superTrend = 0;
  let score = 0, lastChg = NaN;

  for (let i = 0; i < n; i++) {
    const c = close[i];
    const s = srcEma[i];
    const v = vwsd[i];

    if (Number.isNaN(s) || Number.isNaN(v)) {
      scores[i] = score;
      lastChanged[i] = lastChg;
      continue;
    }

    let ub = s + sv_factor * v;
    let lb = s - sv_factor * v;

    const prevC = i > 0 ? close[i - 1] : NaN;

    // Pine: lowerBand := lowerBand > prevLowerBand or C[1] < prevLowerBand ? lowerBand : prevLowerBand
    // On bar 0 prevC is NaN → NaN < prevLB is false
    lb = (lb > prevLB || prevC < prevLB) ? lb : prevLB;
    ub = (ub < prevUB || prevC > prevUB) ? ub : prevUB;

    const prevST = superTrend;

    if (i === 0 || Number.isNaN(vwsd[i - 1])) {
      dir = 1;
    } else if (prevST === prevUB) {
      dir = c > ub ? -1 : 1;
    } else {
      dir = c < lb ? 1 : -1;
    }

    superTrend = dir === -1 ? lb : ub;

    if (dir < 0)       score = 1;
    else if (dir > 0)  score = -1;

    if (i > 0 && score !== scores[i - 1]) lastChg = candles[i].time;
    scores[i] = score;
    lastChanged[i] = lastChg;

    prevLB = lb;
    prevUB = ub;
  }

  return { scores, lastChanged, name: 'SmartVol ST' };
}
