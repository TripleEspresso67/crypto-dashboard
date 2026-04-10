export default function StatsPanel({ stats }) {
  if (!stats) return null;

  const items = [
    { label: 'Initial Capital', value: `$${stats.initialCapital}` },
    { label: 'Final Equity', value: `$${stats.finalEquity}` },
    { label: 'Total Return', value: `${stats.totalReturn}%` },
    { label: 'Buy & Hold Return', value: `${stats.buyHoldReturn}%` },
    { label: 'Number of Trades', value: stats.numberOfTrades ?? stats.totalTrades },
    { label: 'Wins / Losses', value: `${stats.wins} / ${stats.losses}` },
    { label: 'Win Rate', value: `${stats.winRate}%` },
    { label: 'Max Drawdown', value: `${stats.maxDrawdown}%` },
    { label: 'Profit Factor', value: stats.profitFactor },
    { label: 'Sharpe Ratio', value: stats.sharpe },
    { label: 'Sortino Ratio', value: stats.sortino },
    { label: 'Omega Ratio', value: stats.omega },
    { label: 'Kelly Criterion', value: stats.kelly === '--' ? '--' : `${stats.kelly}%` },
  ];

  return (
    <div className="stats-grid">
      {items.map(item => (
        <div className="stat-card" key={item.label}>
          <div className="stat-label">{item.label}</div>
          <div className="stat-value">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
