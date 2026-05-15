import { useEffect, useMemo, useState } from 'react';
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { formatUnits, type Address } from 'viem';
import {
  CFA_FORWARDER,
  CFA_FORWARDER_ABI,
  PAYMENT_SUPER_TOKEN,
  SUPER_TOKEN_ABI,
  SUPER_TOKEN_DECIMALS,
  dollarsPerHourToFlowRate,
  flowRateToDollarsPerHour,
  isPaymentStreamConfigured,
} from '../lib/superfluid';
import { targetChain } from '../lib/wagmi';

interface Props {
  streamerAddress: Address;
}

const RATES = [
  { label: '$0.50/hr', value: 0.5 },
  { label: '$1/hr', value: 1 },
  { label: '$2/hr', value: 2 },
  { label: '$5/hr', value: 5 },
];

export function PaymentStream({ streamerAddress }: Props) {
  const configured = isPaymentStreamConfigured();
  const token = (PAYMENT_SUPER_TOKEN || '0x0000000000000000000000000000000000000000') as Address;

  const { address: viewer, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const wrongChain = isConnected && chainId !== targetChain.id;

  const [rate, setRate] = useState(RATES[1].value);

  const { data: flowInfo, refetch: refetchFlow } = useReadContract({
    abi: CFA_FORWARDER_ABI,
    address: CFA_FORWARDER,
    functionName: 'getFlowInfo',
    args: viewer ? [token, viewer, streamerAddress] : undefined,
    query: { enabled: configured && !!viewer, refetchInterval: 5_000 },
  });

  const { data: balanceData, refetch: refetchBalance } = useReadContract({
    abi: SUPER_TOKEN_ABI,
    address: token,
    functionName: 'balanceOf',
    args: viewer ? [viewer] : undefined,
    query: { enabled: configured && !!viewer, refetchInterval: 10_000 },
  });

  const currentFlowRate = (flowInfo as readonly [bigint, bigint, bigint, bigint] | undefined)?.[1] ?? 0n;
  const flowLastUpdated = (flowInfo as readonly [bigint, bigint, bigint, bigint] | undefined)?.[0] ?? 0n;
  const balance = (balanceData as bigint | undefined) ?? 0n;
  const isStreaming = currentFlowRate > 0n;

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (confirmed) {
      refetchFlow();
      refetchBalance();
    }
  }, [confirmed, refetchFlow, refetchBalance]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isStreaming]);

  const spentSoFar = useMemo(() => {
    if (!isStreaming || flowLastUpdated === 0n) return 0;
    const seconds = Math.max(0, now / 1000 - Number(flowLastUpdated));
    return (Number(currentFlowRate) * seconds) / 1e18;
  }, [isStreaming, flowLastUpdated, currentFlowRate, now]);

  useEffect(() => {
    if (!configured) return;
    const stopOnExit = () => {
      if (isStreaming && viewer) {
        try {
          writeContract({
            abi: CFA_FORWARDER_ABI,
            address: CFA_FORWARDER,
            functionName: 'deleteFlow',
            args: [token, viewer, streamerAddress, '0x'],
            chainId: targetChain.id,
          });
        } catch {
          /* best-effort */
        }
      }
    };
    window.addEventListener('beforeunload', stopOnExit);
    return () => window.removeEventListener('beforeunload', stopOnExit);
  }, [configured, isStreaming, viewer, streamerAddress, writeContract, token]);

  if (!configured) {
    return (
      <div className="stream-pay disabled">
        <div className="stream-pay-header">Pay per second</div>
        <div className="muted small">
          Set <code>VITE_PAYMENT_SUPER_TOKEN</code> to a Super Token address (USDCx, ETHx, etc.) to enable per-second payment streams.
        </div>
      </div>
    );
  }

  const start = () => {
    if (!viewer) return;
    if (wrongChain) {
      switchChain({ chainId: targetChain.id });
      return;
    }
    const flowrate = dollarsPerHourToFlowRate(rate);
    writeContract({
      abi: CFA_FORWARDER_ABI,
      address: CFA_FORWARDER,
      functionName: isStreaming ? 'updateFlow' : 'createFlow',
      args: [token, viewer, streamerAddress, flowrate, '0x'],
      chainId: targetChain.id,
    });
  };

  const stop = () => {
    if (!viewer || !isStreaming) return;
    writeContract({
      abi: CFA_FORWARDER_ABI,
      address: CFA_FORWARDER,
      functionName: 'deleteFlow',
      args: [token, viewer, streamerAddress, '0x'],
      chainId: targetChain.id,
    });
  };

  const balanceFormatted = formatUnits(balance, SUPER_TOKEN_DECIMALS);
  const runwaySeconds = currentFlowRate > 0n ? Number(balance / currentFlowRate) : Infinity;
  const runwayMinutes = Number.isFinite(runwaySeconds) ? runwaySeconds / 60 : Infinity;
  const lowBalance = isStreaming && Number.isFinite(runwayMinutes) && runwayMinutes < 30;

  return (
    <div className="stream-pay">
      <div className="stream-pay-header">Pay per second</div>

      <div className="stream-pay-rate">
        {RATES.map((r) => (
          <button
            key={r.value}
            type="button"
            className={rate === r.value ? 'rate active' : 'rate'}
            onClick={() => setRate(r.value)}
            disabled={isStreaming}
          >
            {r.label}
          </button>
        ))}
      </div>

      {isStreaming ? (
        <>
          <div className="stream-pay-live">
            <span className="dot" /> streaming ${flowRateToDollarsPerHour(currentFlowRate).toFixed(2)}/hr
          </div>
          <div className="stream-pay-spent">
            Paid this session: <strong>${spentSoFar.toFixed(6)}</strong>
          </div>
          <button type="button" onClick={stop} disabled={isPending || confirming} className="stream-pay-stop">
            {isPending ? 'Confirm in wallet…' : confirming ? 'Stopping…' : 'Stop stream'}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={!isConnected || isPending || confirming}
          className="stream-pay-start"
        >
          {!isConnected
            ? 'Connect wallet'
            : wrongChain
              ? `Switch to ${targetChain.name}`
              : isPending
                ? 'Confirm in wallet…'
                : confirming
                  ? 'Opening…'
                  : `Start streaming $${rate}/hr`}
        </button>
      )}

      <div className="muted small">
        Balance: {Number(balanceFormatted).toFixed(4)} super-token
        {lowBalance && <span className="warn"> — runway under 30 min</span>}
      </div>

      {writeError && <div className="error small">{writeError.message.split('\n')[0]}</div>}
    </div>
  );
}
