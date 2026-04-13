import { DEFAULT_BACKTEST_START as SHARED_DEFAULT_BACKTEST_START } from '../constants/backtestDates';

export const DEFAULT_BACKTEST_START = SHARED_DEFAULT_BACKTEST_START;
const INITIAL_CAPITAL = 1000;

/**
 * Run a backtest on scored candles.
 * Long-only, 100% equity sizing, no pyramiding, 0 commission/slippage.
 * Orders are generated on bar close and filled on next bar open (TradingView-style).
 *
 * @param {Array} candles OHLCV candle array
 * @param {number[]} compositeScores composite score per bar
 * @param {number} longThresh score threshold to go long
 * @param {number} shortThresh score threshold to go to cash
 * @param {number} [backtestStart] start timestamp (ms). Defaults to Jan 22 2024.
 * @returns {{ equity: {time,value}[], trades: Object[], stats: Object }}
 */
export function runBacktest(candles, compositeScores, longThresh = 0.1, shortThresh = -0.1, backtestStart = DEFAULT_BACKTEST_START) {
  const equity = [];
  const trades = [];

  let capital = INITIAL_CAPITAL;
  let inLong = false;
  let entryPrice = 0;
  let entryTime = 0;
  let entryCapital = 0;
  let pendingEntry = false;
  let pendingExit = false;
  let peakEquity = INITIAL_CAPITAL;
  let maxDrawdown = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const score = compositeScores[i];

    if (c.time < backtestStart) continue;

    // Execute queued orders at current bar open.
    if (pendingEntry && !inLong) {
      inLong = true;
      entryPrice = c.open;
      entryTime = c.time;
      entryCapital = capital;
      pendingEntry = false;
    }

    if (pendingExit && inLong) {
      const pnlPct = (c.open - entryPrice) / entryPrice;
      capital = entryCapital * (1 + pnlPct);
      trades.push({
        entryTime,
        exitTime: c.time,
        entryPrice,
        exitPrice: c.open,
        pnlPct: pnlPct * 100,
        pnl: capital - entryCapital,
      });
      inLong = false;
      pendingExit = false;
    }

    const goLong = score >= longThresh;
    const goCash = score <= shortThresh;

    // Queue orders for next bar open to match TradingView default execution timing.
    if (i < candles.length - 1) {
      if (goLong && !inLong && !pendingEntry) {
        pendingEntry = true;
      }
      if (goCash && inLong && !pendingExit) {
        pendingExit = true;
      }
    }

    const currentEquity = inLong
      ? entryCapital * (1 + (c.close - entryPrice) / entryPrice)
      : capital;

    equity.push({ time: c.time, value: currentEquity });

    if (currentEquity > peakEquity) peakEquity = currentEquity;
    const dd = (peakEquity - currentEquity) / peakEquity;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const finalEquity = equity.length > 0 ? equity[equity.length - 1].value : INITIAL_CAPITAL;
  const totalReturn = ((finalEquity - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;
  const wins = trades.filter(t => t.pnlPct > 0).length;
  const losses = trades.filter(t => t.pnlPct <= 0).length;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;

  const grossProfit = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  let sharpe = NaN;
  let sortino = NaN;
  let omega = NaN;
  let kelly = NaN;

  const tradePnls = trades.map(t => t.pnlPct / 100);
  if (tradePnls.length >= 2) {
    const mean = tradePnls.reduce((s, v) => s + v, 0) / tradePnls.length;
    const variance = tradePnls.reduce((s, v) => s + (v - mean) ** 2, 0) / (tradePnls.length - 1);
    const std = Math.sqrt(variance);
    sharpe = std > 0 ? mean / std : 0;

    const downsideDev = Math.sqrt(
      tradePnls.reduce((s, r) => s + (r < 0 ? r * r : 0), 0) / tradePnls.length
    );
    sortino = downsideDev > 0 ? mean / downsideDev : (mean > 0 ? Infinity : 0);

    let gains = 0;
    let lossSum = 0;
    for (const r of tradePnls) {
      if (r > 0) gains += r;
      else lossSum += -r;
    }
    omega = lossSum > 0 ? 1 + gains / lossSum : (gains > 0 ? Infinity : 1);
  }

  if (tradePnls.length > 0) {
    const winningTrades = tradePnls.filter(r => r > 0);
    const losingTradesAbs = tradePnls.filter(r => r < 0).map(r => -r);
    const p = winningTrades.length / tradePnls.length;
    const q = 1 - p;

    if (winningTrades.length === 0) {
      kelly = -1;
    } else if (losingTradesAbs.length === 0) {
      kelly = 1;
    } else {
      const avgWin = winningTrades.reduce((s, v) => s + v, 0) / winningTrades.length;
      const avgLoss = losingTradesAbs.reduce((s, v) => s + v, 0) / losingTradesAbs.length;
      const b = avgLoss > 0 ? avgWin / avgLoss : NaN;
      kelly = b > 0 ? p - (q / b) : NaN;
    }
  }

  function fmtRatio(v) {
    if (isNaN(v)) return '--';
    if (!isFinite(v)) return v > 0 ? 'Inf' : '-Inf';
    return v.toFixed(2);
  }

  let buyHoldPct = 0;
  let startClose = NaN;
  let endClose = NaN;
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].time < backtestStart) continue;
    if (isNaN(startClose)) startClose = candles[i].close;
    endClose = candles[i].close;
  }
  if (!isNaN(startClose) && startClose > 0) {
    buyHoldPct = ((endClose - startClose) / startClose) * 100;
  }

  const stats = {
    initialCapital: INITIAL_CAPITAL,
    finalEquity: finalEquity.toFixed(2),
    totalReturn: totalReturn.toFixed(2),
    buyHoldReturn: buyHoldPct.toFixed(2),
    totalTrades: trades.length,
    wins,
    losses,
    winRate: winRate.toFixed(1),
    maxDrawdown: (maxDrawdown * 100).toFixed(2),
    profitFactor: profitFactor === Infinity ? 'Inf' : profitFactor.toFixed(2),
    sharpe: fmtRatio(sharpe),
    sortino: fmtRatio(sortino),
    omega: fmtRatio(omega),
    kelly: isNaN(kelly) ? '--' : (kelly * 100).toFixed(2),
  };

  return { equity, trades, stats };
}
