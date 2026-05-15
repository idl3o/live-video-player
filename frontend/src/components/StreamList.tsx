import { useEffect, useState } from 'react';
import { api, Stream } from '../api/client';

interface Props {
  selected: string | null;
  onSelect: (streamKey: string | null) => void;
}

export function StreamList({ selected, onSelect }: Props) {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await api.listStreams();
        if (!cancelled) {
          setStreams(res.streams.filter((s) => s.app === 'live' && s.publisher));
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed');
      }
    };
    refresh();
    const id = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <aside className="stream-list">
      <h3>Live streams</h3>
      {error && <div className="error">{error}</div>}
      {streams.length === 0 && <div className="empty">No live streams right now.</div>}
      <ul>
        {streams.map((s) => (
          <li key={s.id}>
            <button
              className={selected === s.stream ? 'active' : ''}
              onClick={() => onSelect(s.stream)}
            >
              {s.stream}
              <span className="viewer-count">{s.subscribers} viewers</span>
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <button className="clear" onClick={() => onSelect(null)}>
          Close player
        </button>
      )}
    </aside>
  );
}
