import { useEffect, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { api, getToken, MeResponse, setToken } from './api/client';
import { SiweConnect } from './components/SiweConnect';
import { StreamList } from './components/StreamList';
import { FlvPlayer } from './components/FlvPlayer';
import { Chat } from './components/Chat';

export default function App() {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [selectedStream, setSelectedStream] = useState<string | null>(null);

  const loadMe = async () => {
    if (!getToken()) {
      setAuthReady(true);
      return;
    }
    try {
      setUser(await api.me());
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setAuthReady(true);
    }
  };

  useEffect(() => {
    loadMe();
  }, []);

  const signOut = () => {
    setToken(null);
    setUser(null);
    setSelectedStream(null);
  };

  if (!authReady) return <div className="loading">Loading…</div>;

  if (!user) {
    return (
      <div className="app-shell auth">
        <header>
          <h1>Live Video Player</h1>
        </header>
        <SiweConnect onLogin={loadMe} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header>
        <h1>Live Video Player</h1>
        <div className="user-bar">
          <span>{user.username}</span>
          {user.walletAddress && (
            <code title="Wallet address">
              {user.walletAddress.slice(0, 6)}…{user.walletAddress.slice(-4)}
            </code>
          )}
          {user.streamKey && <code title="Your stream key">{user.streamKey}</code>}
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="avatar" />
          <button onClick={signOut}>Sign out</button>
        </div>
      </header>

      <main>
        <StreamList selected={selectedStream} onSelect={setSelectedStream} />

        <section className="viewer">
          {selectedStream ? (
            <>
              <FlvPlayer streamKey={selectedStream} />
              <Chat streamKey={selectedStream} username={user.username} />
            </>
          ) : (
            <div className="placeholder">Select a stream to start watching.</div>
          )}
        </section>
      </main>
    </div>
  );
}
