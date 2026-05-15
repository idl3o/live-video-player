const TOKEN_KEY = 'lvp.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export interface Stream {
  id: string;
  app: string;
  stream: string;
  subscribers: number;
  publisher: null | {
    type: string;
    clientId: string;
    ip: string;
    audio: unknown;
    video: unknown;
  };
}

export interface MeResponse {
  userId: string;
  username: string;
  role: string;
  streamKey?: string;
  walletAddress?: string;
  allowedToStream: boolean;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  me: () => request<MeResponse>('/api/auth/me'),

  register: (username: string, email: string, password: string) =>
    request<{ message: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    }),

  listStreams: () => request<{ success: boolean; streams: Stream[] }>('/api/streams'),

  regenerateStreamKey: () =>
    request<{ streamKey: string }>('/api/auth/regenerate-stream-key', { method: 'POST' }),

  siweNonce: (address: string) =>
    request<{ nonce: string }>(`/api/auth/siwe/nonce?address=${address}`),

  siweVerify: (message: string, signature: string) =>
    request<{ token: string; user: MeResponse }>('/api/auth/siwe/verify', {
      method: 'POST',
      body: JSON.stringify({ message, signature }),
    }),
};
