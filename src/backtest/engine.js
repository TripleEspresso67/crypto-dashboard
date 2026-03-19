export const DEFAULT_BACKTEST_START = new Date('2023-01-01T00:00:00Z').getTime();
const INITIAL_CAPITAL = 1000;

/**
 * Run a backtest on scored candles.
 * Long-only, 100% equity sizing, no pyramiding, 0 commission/slippage.
 *
 * @param {Array} candles OHLCV candle array
 * @param {number[]} compositeScores composite score per bar
 * @param {number} longThresh score threshold to go long
 * @param {number} shortThresh score threshold to go to cash
 * @param {number} [backtestStart] start timestamp (ms). Defaults to Jan 1 2023.
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
  let peakEquity = INITIAL_CAPITAL;
  let maxDrawdown = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const score = compositeScores[i];

    if (c.time < backtestStart) continue;

    const goLong = score >= longThresh;
    const goCash = score <= shortThresh;

    if (goLong && !inLong) {
      inLong = true;
      entryPrice = c.close;
      entryTime = c.time;
      entryCapital = capital;
    }

    if (goCash && inLong) {
      const pnlPct = (c.close - entryPrice) / entryPrice;
      capital = entryCapital * (1 + pnlPct);
      trades.push({
        entryTime,
        exitTime: c.time,
        entryPrice,
        exitPrice: c.close,
        pnlPct: pnlPct * 100,
        pnl: capital - entryCapital,
      });
      inLong = false;
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

  const eqReturns = [];
  for (let i = 1; i < equity.length; i++) {
    if (equity[i - 1].value > 0) {
      eqReturns.push(equity[i].value / equity[i - 1].value - 1);
    }
  }

  let sharpe = NaN;
  let sortino = NaN;
  let omega = NaN;

  if (eqReturns.length >= 2) {
    const mean = eqReturns.reduce((s, v) => s + v, 0) / eqReturns.length;
    const variance = eqReturns.reduce((s, v) => s + (v - mean) ** 2, 0) / (eqReturns.length - 1);
    const std = Math.sqrt(variance);
    sharpe = std > 0 ? (mean / std) * Math.sqrt(365) : 0;

    const downSquared = eqReturns.filter(r => r < 0).map(r => r * r);
    const downsideDev = downSquared.length > 0
      ? Math.sqrt(downSquared.reduce((s, v) => s + v, 0) / eqReturns.length)
      : 0;
    sortino = downsideDev > 0 ? (mean / downsideDev) * Math.sqrt(365) : (mean > 0 ? Infinity : 0);

    let gains = 0;
    let lossSum = 0;
    for (const r of eqReturns) {
      if (r > 0) gains += r;
      else lossSum += -r;
    }
    omega = lossSum > 0 ? 1 + gains / lossSum : (gains > 0 ? Infinity : 1);
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
  };

  return { equity, trades, stats };
}
