import { useState } from 'react';
import { useAccount, useChainId, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, type Address } from 'viem';
import { ERC20_ABI, USDC_BASE_SEPOLIA, USDC_DECIMALS } from '../lib/contracts';
import { targetChain } from '../lib/wagmi';

interface Props {
  streamerAddress: Address;
}

const PRESETS = ['0.10', '1', '5'];

export function TipButton({ streamerAddress }: Props) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [amount, setAmount] = useState('1');

  const { writeContract, data: hash, isPending, reset, error: writeError } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash });

  const wrongChain = isConnected && chainId !== targetChain.id;

  const send = () => {
    if (wrongChain) {
      switchChain({ chainId: targetChain.id });
      return;
    }
    const value = parseUnits(amount || '0', USDC_DECIMALS);
    if (value <= 0n) return;
    writeContract({
      address: USDC_BASE_SEPOLIA,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [streamerAddress, value],
      chainId: targetChain.id,
    });
  };

  return (
    <div className="tip-box">
      <div className="tip-header">
        <span>Tip in USDC</span>
        <span className="tip-target">→ {streamerAddress.slice(0, 6)}…{streamerAddress.slice(-4)}</span>
      </div>
      <div className="tip-presets">
        {PRESETS.map((p) => (
          <button key={p} type="button" className={amount === p ? 'preset active' : 'preset'} onClick={() => setAmount(p)}>
            ${p}
          </button>
        ))}
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="tip-amount"
        />
      </div>
      <button type="button" onClick={send} disabled={!isConnected || isPending || confirming} className="tip-send">
        {!isConnected
          ? 'Connect wallet to tip'
          : wrongChain
            ? `Switch to ${targetChain.name}`
            : isPending
              ? 'Confirm in wallet…'
              : confirming
                ? 'Confirming…'
                : confirmed
                  ? 'Tip sent ✓'
                  : `Send $${amount} USDC`}
      </button>
      {confirmed && hash && (
        <a
          className="tip-link"
          href={`${targetChain.blockExplorers?.default.url}/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
          onClick={() => setTimeout(reset, 100)}
        >
          View on explorer ↗
        </a>
      )}
      {writeError && <div className="error tip-error">{writeError.message.split('\n')[0]}</div>}
    </div>
  );
}
