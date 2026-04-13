import { formatUtcDate } from '../dateTime';

export default function ScoreTable({ indicatorResults, candles }) {
  if (!indicatorResults || indicatorResults.length === 0) return null;
  const lastIdx = candles.length - 1;

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
            <th style={{ textAlign: 'right' }}>Last Change (UTC)</th>
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
                <td style={{ textAlign: 'right' }}>{formatUtcDate(r.lastChanged[lastIdx])} UTC</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
