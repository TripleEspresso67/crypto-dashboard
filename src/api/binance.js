const BINANCE_BASE = 'https://api.binance.com';
const BYBIT_BASE = 'https://api.bybit.com';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchBinanceCandles(symbol, interval, startTime, endTime, limit = 1000) {
  const params = new URLSearchParams({
    symbol, interval,
    startTime: String(startTime),
    limit: String(limit),
  });
  if (endTime) params.set('endTime', String(endTime));

  const res = await fetch(`${BINANCE_BASE}/api/v3/klines?${params}`);
  if (!res.ok) throw new Error(`Binance ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.map(k => ({
    time: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6],
  }));
}

const BYBIT_INTERVAL_MAP = { '1d': 'D', '3d': 'W' };

async function fetchBybitCandles(symbol, interval, startTime, endTime) {
  const bybitInterval = BYBIT_INTERVAL_MAP[interval] || 'D';
  const end = endTime || Date.now();

  const params = new URLSearchParams({
    category: 'spot',
    symbol,
    interval: bybitInterval,
    start: String(startTime),
    end: String(end),
    limit: '1000',
  });

  const res = await fetch(`${BYBIT_BASE}/v5/market/kline?${params}`);
  if (!res.ok) throw new Error(`Bybit ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.retCode !== 0) throw new Error(`Bybit error: ${json.retMsg}`);

  return (json.result?.list || [])
    .map(k => ({
      time: parseInt(k[0], 10),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      closeTime: parseInt(k[0], 10) + 86400000 - 1,
    }))
    .reverse();
}

async function fetchAllBinance(symbol, interval, startTime) {
  const allCandles = [];
  let cursor = startTime;
  const now = Date.now();

  while (cursor < now) {
    const batch = await fetchBinanceCandles(symbol, interval, cursor, now, 1000);
    if (batch.length === 0) break;
    allCandles.push(...batch);
    cursor = batch[batch.length - 1].closeTime + 1;
    if (batch.length < 1000) break;
    await sleep(150);
  }

  return dedup(allCandles);
}

async function fetchAllBybit(symbol, interval, startTime) {
  const allCandles = [];
  let cursor = startTime;
  const now = Date.now();

  while (cursor < now) {
    const batch = await fetchBybitCandles(symbol, interval, cursor, now);
    if (batch.length === 0) break;
    allCandles.push(...batch);
    cursor = batch[batch.length - 1].time + 86400000;
    if (batch.length < 1000) break;
    await sleep(150);
  }

  return dedup(allCandles);
}

function dedup(candles) {
  const seen = new Set();
  return candles.filter(c => {
    if (seen.has(c.time)) return false;
    seen.add(c.time);
    return true;
  });
}

const MS_PER_DAY = 86400000;

/**
 * Resample 1D candles into 3D candles aligned to TradingView's bar boundaries.
 * TradingView resets the 3D cycle on January 1st of each year, so the last
 * bar of each year may contain only 1-2 days. Within each year, bars are
 * grouped in sets of 3 starting from Jan 1.
 */
export function resample1dTo3d(dailyCandles) {
  const groups = new Map();
  for (const candle of dailyCandles) {
    const d = new Date(candle.time);
    const year = d.getUTCFullYear();
    const jan1 = Date.UTC(year, 0, 1);
    const dayOfYear = Math.floor((candle.time - jan1) / MS_PER_DAY);
    const groupKey = year * 1000 + Math.floor(dayOfYear / 3);
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(candle);
  }

  const sortedKeys = [...groups.keys()].sort((a, b) => a - b);
  const result = [];
  for (const key of sortedKeys) {
    const bars = groups.get(key);
    bars.sort((a, b) => a.time - b.time);
    result.push({
      time: bars[0].time,
      open: bars[0].open,
      high: Math.max(...bars.map(b => b.high)),
      low: Math.min(...bars.map(b => b.low)),
      close: bars[bars.length - 1].close,
      volume: bars.reduce((s, b) => s + b.volume, 0),
      closeTime: bars[bars.length - 1].closeTime,
    });
  }
  return result;
}

const BYBIT_SYMBOLS = new Set(['HYPEUSDT']);

/**
 * Fetch live ticker prices for all symbols in a single batch.
 * Returns { BTCUSDT: 84200.5, ETHUSDT: 1920.3, ... }
 */
export async function fetchLivePrices() {
  const prices = {};

  const binanceSymbols = ASSET_CONFIGS
    .filter(c => !BYBIT_SYMBOLS.has(c.symbol))
    .map(c => c.symbol);
  const uniqueBinance = [...new Set(binanceSymbols)];

  try {
    const params = new URLSearchParams({
      symbols: JSON.stringify(uniqueBinance),
    });
    const res = await fetch(`${BINANCE_BASE}/api/v3/ticker/price?${params}`);
    if (res.ok) {
      const data = await res.json();
      for (const t of data) {
        prices[t.symbol] = parseFloat(t.price);
      }
    }
  } catch (err) {
    console.warn('Binance ticker failed:', err.message);
  }

  for (const sym of BYBIT_SYMBOLS) {
    try {
      const res = await fetch(
        `${BYBIT_BASE}/v5/market/tickers?category=spot&symbol=${sym}`
      );
      if (res.ok) {
        const json = await res.json();
        const item = json.result?.list?.[0];
        if (item) prices[sym] = parseFloat(item.lastPrice);
      }
    } catch (err) {
      console.warn(`Bybit ticker failed for ${sym}:`, err.message);
    }
  }

  return prices;
}

/**
 * Fetch all candles, using Bybit for symbols not on Binance.
 * For 3D intervals, fetches 1D candles and resamples to match
 * TradingView's 3D bar boundaries.
 */
export async function fetchAllCandles(symbol, interval, startTime) {
  if (interval === '3d') {
    const daily = BYBIT_SYMBOLS.has(symbol)
      ? await fetchAllBybit(symbol, '1d', startTime)
      : await fetchAllBinance(symbol, '1d', startTime);
    return resample1dTo3d(daily);
  }
  if (BYBIT_SYMBOLS.has(symbol)) {
    return fetchAllBybit(symbol, interval, startTime);
  }
  try {
    return await fetchAllBinance(symbol, interval, startTime);
  } catch (err) {
    console.warn(`Binance failed for ${symbol}, trying Bybit: ${err.message}`);
    return fetchAllBybit(symbol, interval, startTime);
  }
}

export function getWarmupStart(interval) {
  return new Date('2017-01-01T00:00:00Z').getTime();
}

export const ASSET_CONFIGS = [
  { symbol: 'BTCUSDT', name: 'BTC', interval: '3d', strategy: 'LTTI', label: 'BTC (LTTI 3D)' },
  { symbol: 'BTCUSDT', name: 'BTC', interval: '1d', strategy: 'MTTI-BTC', label: 'BTC (MTTI 1D)' },
  { symbol: 'ETHUSDT', name: 'ETH', interval: '1d', strategy: 'MTTI-others', label: 'ETH (MTTI 1D)' },
  { symbol: 'BNBUSDT', name: 'BNB', interval: '1d', strategy: 'MTTI-others', label: 'BNB (MTTI 1D)' },
  { symbol: 'SOLUSDT', name: 'SOL', interval: '1d', strategy: 'MTTI-others', label: 'SOL (MTTI 1D)' },
  { symbol: 'DOGEUSDT', name: 'DOGE', interval: '1d', strategy: 'MTTI-others', label: 'DOGE (MTTI 1D)' },
  { symbol: 'SUIUSDT', name: 'SUI', interval: '1d', strategy: 'MTTI-others', label: 'SUI (MTTI 1D)' },
  { symbol: 'HYPEUSDT', name: 'HYPE', interval: '1d', strategy: 'MTTI-others', label: 'HYPE (MTTI 1D)' },
];
