import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface Message {
  id: string;
  userId: string;
  username: string;
  message: string;
  timestamp: string;
  type: 'message' | 'system';
}

interface Props {
  streamKey: string;
  username: string;
}

export function Chat({ streamKey, username }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [roomId, setRoomId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('register', { username });
    });
    socket.on('registered', () => {
      socket.emit('join-room', { roomId: `stream_${streamKey}`, streamKey, user: { username } });
    });
    socket.on('room-joined', (data: { roomId: string; recentMessages: Message[] }) => {
      setRoomId(data.roomId);
      setMessages(data.recentMessages || []);
    });
    socket.on('new-message', (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
    });
    socket.on('error', (err: { message: string }) => {
      console.warn('[chat]', err.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [streamKey, username]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !roomId || !socketRef.current) return;
    socketRef.current.emit('send-message', { roomId, message: draft.trim() });
    setDraft('');
  };

  return (
    <div className="chat">
      <div className="chat-messages" ref={scrollRef}>
        {messages.map((m) => (
          <div key={m.id} className={`chat-message chat-${m.type}`}>
            <span className="chat-user">{m.username}:</span> {m.message}
          </div>
        ))}
      </div>
      <form className="chat-input" onSubmit={send}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Say something…"
        />
        <button type="submit" disabled={!draft.trim() || !roomId}>
          Send
        </button>
      </form>
    </div>
  );
}
