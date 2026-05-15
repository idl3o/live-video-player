import { useEffect, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { formatUnits, parseAbiItem, type Address, type Log } from 'viem';
import { USDC_BASE_SEPOLIA, USDC_DECIMALS } from '../lib/contracts';
import { targetChain } from '../lib/wagmi';

interface Props {
  streamerAddress: Address;
  refreshTrigger?: number;
}

interface Tip {
  from: Address;
  amount: string;
  txHash: string;
  blockNumber: bigint;
}

// Look back ~24h on Base Sepolia (~2s blocks → ~43200 blocks).
const LOOKBACK_BLOCKS = 43_200n;

export function RecentTips({ streamerAddress, refreshTrigger }: Props) {
  const client = usePublicClient({ chainId: targetChain.id });
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const latest = await client.getBlockNumber();
        const fromBlock = latest > LOOKBACK_BLOCKS ? latest - LOOKBACK_BLOCKS : 0n;
        const logs = await client.getLogs({
          address: USDC_BASE_SEPOLIA,
          event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'),
          args: { to: streamerAddress },
          fromBlock,
          toBlock: 'latest',
        });
        if (cancelled) return;
        const parsed: Tip[] = logs
          .map((log: Log & { args?: { from?: Address; value?: bigint } }) => ({
            from: log.args?.from ?? ('0x0000000000000000000000000000000000000000' as Address),
            amount: formatUnits(log.args?.value ?? 0n, USDC_DECIMALS),
            txHash: log.transactionHash || '',
            blockNumber: log.blockNumber || 0n,
          }))
          .sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1))
          .slice(0, 5);
        setTips(parsed);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message.split('\n')[0] : 'Failed to load tips');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, streamerAddress, refreshTrigger]);

  return (
    <div className="recent-tips">
      <div className="recent-tips-header">Recent tips</div>
      {loading && <div className="muted small">Loading…</div>}
      {error && <div className="error small">{error}</div>}
      {!loading && !error && tips.length === 0 && <div className="muted small">No tips yet — be the first.</div>}
      <ul>
        {tips.map((t) => (
          <li key={t.txHash}>
            <code className="tip-from">{t.from.slice(0, 6)}…{t.from.slice(-4)}</code>
            <span className="tip-value">${t.amount}</span>
            <a
              className="tip-link small"
              href={`${targetChain.blockExplorers?.default.url}/tx/${t.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              ↗
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
