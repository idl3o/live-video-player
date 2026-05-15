import { useEffect, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import type { Address } from 'viem';
import { api, getToken, MeResponse, setToken, Stream } from './api/client';
import { SiweConnect } from './components/SiweConnect';
import { StreamList } from './components/StreamList';
import { StreamPlayer } from './components/StreamPlayer';
import { Chat } from './components/Chat';
import { RecordingsList } from './components/RecordingsList';
import { TipButton } from './components/TipButton';
import { RecentTips } from './components/RecentTips';
import { PaymentStream } from './components/PaymentStream';
import { AttestationBadges } from './components/AttestationBadges';

export default function App() {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [selectedStream, setSelectedStream] = useState<Stream | null>(null);
  const [lowLatency, setLowLatency] = useState(false);

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

  const streamerAddress = selectedStream?.streamerAddress as Address | undefined;

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
        <div className="sidebar">
          <StreamList selected={selectedStream?.stream ?? null} onSelect={setSelectedStream} />
          <RecordingsList streamerAddress={streamerAddress} />
        </div>

        <section className="viewer">
          {selectedStream ? (
            <>
              <div className="viewer-main">
                <StreamPlayer streamKey={selectedStream.stream} preferLowLatency={lowLatency} />
                <div className="viewer-meta">
                  <label className="latency-toggle" title="HLS (default) plays on iOS; FLV is ~2s lower latency but desktop only">
                    <input
                      type="checkbox"
                      checked={lowLatency}
                      onChange={(e) => setLowLatency(e.target.checked)}
                    />
                    low-latency (FLV)
                  </label>
                  <div className="viewer-title">
                    <div>{selectedStream.streamerUsername || selectedStream.stream}</div>
                    {streamerAddress && <AttestationBadges address={streamerAddress} />}
                  </div>
                  {streamerAddress ? (
                    <>
                      <TipButton streamerAddress={streamerAddress} />
                      <PaymentStream streamerAddress={streamerAddress} />
                      <RecentTips streamerAddress={streamerAddress} />
                    </>
                  ) : (
                    <div className="muted small">
                      This streamer hasn't connected a wallet — tipping unavailable.
                    </div>
                  )}
                </div>
              </div>
              <Chat streamKey={selectedStream.stream} username={user.username} />
            </>
          ) : (
            <div className="placeholder">Select a stream to start watching.</div>
          )}
        </section>
      </main>
    </div>
  );
}
