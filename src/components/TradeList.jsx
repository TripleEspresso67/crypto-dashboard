import { formatUtcDate } from '../dateTime';

export default function TradeList({ trades }) {
  if (!trades || trades.length === 0) return <p style={{ color: 'var(--text-secondary)' }}>No trades in backtest period.</p>;

  function formatPrice(p) {
    if (p >= 1000) return p.toFixed(2);
    if (p >= 1) return p.toFixed(4);
    return p.toFixed(6);
  }

  return (
    <div className="trade-list-container">
      <table className="trade-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Entry Date (UTC)</th>
            <th>Exit Date (UTC)</th>
            <th>Entry Price</th>
            <th>Exit Price</th>
            <th>Trade P&L %</th>
            <th>Cumulative P&L %</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t, idx) => {
            const cumPnl = trades.slice(0, idx + 1).reduce((acc, tr) => acc * (1 + tr.pnlPct / 100), 1);
            const cumPnlPct = (cumPnl - 1) * 100;
            return (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>{formatUtcDate(t.entryTime)} UTC</td>
                <td>{formatUtcDate(t.exitTime)} UTC</td>
                <td>{formatPrice(t.entryPrice)}</td>
                <td>{formatPrice(t.exitPrice)}</td>
                <td style={{ color: t.pnlPct >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                  {t.pnlPct >= 0 ? '+' : ''}{t.pnlPct.toFixed(2)}%
                </td>
                <td style={{ color: cumPnlPct >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                  {cumPnlPct >= 0 ? '+' : ''}{cumPnlPct.toFixed(2)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
