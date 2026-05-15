import { useEffect, useState } from 'react';
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import {
  LIVE_STREAM_CONTENT_ABI,
  LIVE_STREAM_CONTRACT,
  isRegistryConfigured,
} from '../lib/liveStreamContent';
import { targetChain } from '../lib/wagmi';

interface Props {
  contentCid: string;
  title: string;
}

export function RegisterOnChainButton({ contentCid, title }: Props) {
  const configured = isRegistryConfigured();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [justRegistered, setJustRegistered] = useState(false);

  const wrongChain = isConnected && chainId !== targetChain.id;

  const { data: registration, refetch } = useReadContract({
    abi: LIVE_STREAM_CONTENT_ABI,
    address: configured ? (LIVE_STREAM_CONTRACT as `0x${string}`) : undefined,
    functionName: 'getContent',
    args: [contentCid],
    query: { enabled: configured && !!contentCid },
  });

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (confirmed) {
      setJustRegistered(true);
      refetch();
    }
  }, [confirmed, refetch]);

  if (!configured) return null;

  const [registeredCreator] = (registration as readonly [string, bigint, string] | undefined) ?? [
    '0x0000000000000000000000000000000000000000',
    0n,
    '',
  ];
  const isAlreadyRegistered =
    registeredCreator !== '0x0000000000000000000000000000000000000000';

  if (isAlreadyRegistered || justRegistered) {
    const txHashShort = hash ? `${hash.slice(0, 10)}…` : '';
    const explorer = targetChain.blockExplorers?.default.url;
    return (
      <a
        className="onchain-verified small"
        href={
          hash && explorer ? `${explorer}/tx/${hash}` : explorer ? `${explorer}/address/${LIVE_STREAM_CONTRACT}` : '#'
        }
        target="_blank"
        rel="noreferrer"
        title={`Registered on ${targetChain.name}${txHashShort ? ` (${txHashShort})` : ''}`}
      >
        ✓ on-chain
      </a>
    );
  }

  const submit = () => {
    if (wrongChain) {
      switchChain({ chainId: targetChain.id });
      return;
    }
    writeContract({
      abi: LIVE_STREAM_CONTENT_ABI,
      address: LIVE_STREAM_CONTRACT as `0x${string}`,
      functionName: 'registerContent',
      args: [contentCid, title],
      chainId: targetChain.id,
    });
  };

  return (
    <button
      type="button"
      className="register-onchain small"
      onClick={submit}
      disabled={!isConnected || isPending || confirming}
      title={error?.message.split('\n')[0]}
    >
      {!isConnected
        ? 'connect to register'
        : wrongChain
          ? 'switch chain'
          : isPending
            ? '…signing'
            : confirming
              ? '…confirming'
              : 'register on-chain'}
    </button>
  );
}
