import { useState } from 'react';
import { useAccount, useChainId, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import type { Address } from 'viem';
import {
  CLIP_PRAISE_SCHEMA,
  EAS_ABI,
  EAS_CONTRACT,
  encodeClipPraise,
  isEasConfigured,
} from '../lib/eas';
import { targetChain } from '../lib/wagmi';

interface Props {
  contentCid: string;
  recipient: Address;
}

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

export function PraiseButton({ contentCid, recipient }: Props) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const wrongChain = isConnected && chainId !== targetChain.id;
  const [praising, setPraising] = useState(false);

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash });

  if (!isEasConfigured()) return null;

  const submit = () => {
    if (!isConnected) return;
    if (wrongChain) {
      switchChain({ chainId: targetChain.id });
      return;
    }
    setPraising(true);
    const data = encodeClipPraise(contentCid, 1, '');
    writeContract({
      abi: EAS_ABI,
      address: EAS_CONTRACT,
      functionName: 'attest',
      args: [
        {
          schema: CLIP_PRAISE_SCHEMA,
          data: {
            recipient,
            expirationTime: 0n,
            revocable: true,
            refUID: ZERO_BYTES32,
            data,
            value: 0n,
          },
        },
      ],
      chainId: targetChain.id,
    });
  };

  if (confirmed) {
    return <span className="praise-confirmed small">✓ praised</span>;
  }

  return (
    <button
      type="button"
      className="praise-btn small"
      onClick={submit}
      disabled={!isConnected || isPending || confirming}
      title={writeError?.message.split('\n')[0]}
    >
      {isPending || confirming || praising ? '…' : '+ praise'}
    </button>
  );
}
