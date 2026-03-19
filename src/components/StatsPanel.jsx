export default function StatsPanel({ stats }) {
  if (!stats) return null;

  const items = [
    { label: 'Initial Capital', value: `$${stats.initialCapital}`, cls: '' },
    { label: 'Final Equity', value: `$${stats.finalEquity}`, cls: parseFloat(stats.finalEquity) >= stats.initialCapital ? 'positive' : 'negative' },
    { label: 'Total Return', value: `${stats.totalReturn}%`, cls: parseFloat(stats.totalReturn) >= 0 ? 'positive' : 'negative' },
    { label: 'Buy & Hold Return', value: `${stats.buyHoldReturn}%`, cls: parseFloat(stats.buyHoldReturn) >= 0 ? 'positive' : 'negative' },
    { label: 'Total Trades', value: stats.totalTrades, cls: '' },
    { label: 'Wins / Losses', value: `${stats.wins} / ${stats.losses}`, cls: '' },
    { label: 'Win Rate', value: `${stats.winRate}%`, cls: parseFloat(stats.winRate) >= 50 ? 'positive' : 'negative' },
    { label: 'Max Drawdown', value: `${stats.maxDrawdown}%`, cls: 'negative' },
    { label: 'Profit Factor', value: stats.profitFactor, cls: parseFloat(stats.profitFactor) >= 1 ? 'positive' : 'negative' },
    { label: 'Sharpe Ratio', value: stats.sharpe, cls: parseFloat(stats.sharpe) > 0 ? 'positive' : parseFloat(stats.sharpe) < 0 ? 'negative' : '' },
    { label: 'Sortino Ratio', value: stats.sortino, cls: parseFloat(stats.sortino) > 0 ? 'positive' : parseFloat(stats.sortino) < 0 ? 'negative' : '' },
    { label: 'Omega Ratio', value: stats.omega, cls: parseFloat(stats.omega) > 1 ? 'positive' : parseFloat(stats.omega) < 1 ? 'negative' : '' },
  ];

  return (
    <div className="stats-grid">
      {items.map(item => (
        <div className="stat-card" key={item.label}>
          <div className="stat-label">{item.label}</div>
          <div className={`stat-value ${item.cls}`}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}
