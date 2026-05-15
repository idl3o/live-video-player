import { useEffect, useState } from 'react';
import { api, getToken, MeResponse, setToken } from './api/client';
import { Login } from './components/Login';
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
        <Login onLogin={loadMe} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header>
        <h1>Live Video Player</h1>
        <div className="user-bar">
          <span>{user.username}</span>
          {user.streamKey && <code title="Your stream key">{user.streamKey}</code>}
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
