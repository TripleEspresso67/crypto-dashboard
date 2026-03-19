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
 */
export async function fetchAllCandles(symbol, interval, startTime) {
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
  const backtestStart = new Date('2023-01-01T00:00:00Z').getTime();
  const warmupBars = 200;
  if (interval === '3d') {
    return backtestStart - warmupBars * 3 * 24 * 60 * 60 * 1000;
  }
  return backtestStart - warmupBars * 24 * 60 * 60 * 1000;
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
