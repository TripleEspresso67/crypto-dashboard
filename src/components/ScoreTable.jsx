export default function ScoreTable({ indicatorResults, candles }) {
  if (!indicatorResults || indicatorResults.length === 0) return null;
  const lastIdx = candles.length - 1;

  function formatDate(ts) {
    if (!ts || isNaN(ts)) return '--';
    return new Date(ts).toLocaleDateString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  }

  function scoreClass(s) {
    if (s > 0) return 'positive';
    if (s < 0) return 'negative';
    return 'zero';
  }

  return (
    <div className="table-scroll">
      <table className="score-table">
        <thead>
          <tr>
            <th>Indicator</th>
            <th style={{ textAlign: 'center' }}>Score</th>
            <th style={{ textAlign: 'right' }}>Last Change</th>
          </tr>
        </thead>
        <tbody>
          {indicatorResults.map(r => {
            const current = r.scores[lastIdx];
            return (
              <tr key={r.key}>
                <td>{r.name}</td>
                <td style={{ textAlign: 'center' }}>
                  <span className={`score-cell ${scoreClass(current)}`}>
                    {current > 0 ? '+1' : current < 0 ? '-1' : '0'}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>{formatDate(r.lastChanged[lastIdx])}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
