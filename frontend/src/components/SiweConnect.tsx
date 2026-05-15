import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useSignMessage } from 'wagmi';
import { SiweMessage } from 'siwe';
import { api, setToken } from '../api/client';
import { targetChain } from '../lib/wagmi';
import { Login } from './Login';

interface Props {
  onLogin: () => void;
}

export function SiweConnect({ onLogin }: Props) {
  const { address, isConnected, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const { nonce } = await api.siweNonce(address);
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: 'Sign in to Live Video Player.',
        uri: window.location.origin,
        version: '1',
        chainId: targetChain.id,
        nonce,
      });
      const prepared = message.prepareMessage();
      const signature = await signMessageAsync({ message: prepared });
      const { token } = await api.siweVerify(prepared, signature);
      setToken(token);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  const wrongChain = isConnected && chainId !== undefined && chainId !== targetChain.id;

  return (
    <div className="siwe-connect">
      <h2>Sign in</h2>
      <p className="muted">Connect a wallet on Base Sepolia, then sign a one-time message to authenticate.</p>

      <div className="connect-row">
        <ConnectButton showBalance={false} />
      </div>

      {isConnected && !wrongChain && (
        <button type="button" onClick={signIn} disabled={busy} className="primary">
          {busy ? 'Signing…' : 'Sign in with Ethereum'}
        </button>
      )}

      {wrongChain && (
        <div className="error">
          Wrong network. Switch your wallet to {targetChain.name}.
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <details className="admin-fallback">
        <summary>Admin login (username/password)</summary>
        <Login onLogin={onLogin} />
      </details>
    </div>
  );
}
