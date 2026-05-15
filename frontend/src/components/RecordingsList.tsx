import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import { api, Recording } from '../api/client';
import { PraiseButton } from './PraiseButton';
import { RegisterOnChainButton } from './RegisterOnChainButton';

interface Props {
  streamerAddress?: Address;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function RecordingsList({ streamerAddress }: Props) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await api.listRecordings();
        if (!cancelled) {
          setRecordings(res.data || []);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="recordings-list">
      <h3>Past recordings</h3>
      {loading && <div className="muted small">Loading…</div>}
      {error && <div className="error small">{error}</div>}
      {!loading && !error && recordings.length === 0 && (
        <div className="muted small">No recordings yet.</div>
      )}
      <ul>
        {recordings.map((r) => (
          <li key={r.filename} className="recording-row">
            <div className="recording-name">{r.filename}</div>
            <div className="recording-meta">
              {formatSize(r.size)} · {formatDate(r.createdAt)}
            </div>
            <div className="recording-links">
              {r.ipfsData?.storachaUrl ? (
                <a href={r.ipfsData.storachaUrl} target="_blank" rel="noreferrer" title="Storacha (Filecoin-backed)">
                  ↗ filecoin
                </a>
              ) : r.ipfsData?.url ? (
                <a href={r.ipfsData.url} target="_blank" rel="noreferrer" title="Local IPFS gateway">
                  ↗ ipfs
                </a>
              ) : (
                <span className="muted">local only</span>
              )}
              <a href={`/recordings/${r.filename}`} target="_blank" rel="noreferrer">
                ▶ play
              </a>
              {streamerAddress && r.ipfsData?.cid && (
                <PraiseButton contentCid={r.ipfsData.cid} recipient={streamerAddress} />
              )}
              {r.ipfsData?.cid && (
                <RegisterOnChainButton contentCid={r.ipfsData.cid} title={r.filename} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
