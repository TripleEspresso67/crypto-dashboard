import { useEffect, useState } from 'react';

const STORAGE_KEY = 'crypto-dashboard-improvements-notes';

const DEFAULT_ITEMS = [
  'Create BTC short asset strategy / allocation strategy',
  'remove old strategies',
  'integrate fundamental LTTI indicators with technical LTTI',
  'reorder asset pairs in table',
];

function loadNotes() {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export default function ImprovementsPage() {
  const [notes, setNotes] = useState(loadNotes);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, notes);
    } catch {
      // ignore storage errors
    }
  }, [notes]);

  return (
    <div>
      <div className="section">
        <h3 className="section-title">Improvement Backlog</h3>
        <ul style={{ paddingLeft: 20, color: 'var(--text-primary)' }}>
          {DEFAULT_ITEMS.map(item => (
            <li key={item} style={{ marginBottom: 8 }}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="section">
        <h3 className="section-title">Your Notes</h3>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Write future dashboard improvements here..."
          style={{
            width: '100%',
            minHeight: 180,
            resize: 'vertical',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 12,
            fontFamily: 'inherit',
            fontSize: '0.9rem',
            lineHeight: 1.45,
          }}
        />
      </div>
    </div>
  );
}
