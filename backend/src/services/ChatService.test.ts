import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'http';
import { AddressInfo } from 'net';
import { io as Client, type Socket } from 'socket.io-client';
import { ChatService } from './ChatService';
import { authService } from './AuthService';
import { UserRole } from '../models/User';

// End-to-end socket.io test: starts a real chat service on a random port and
// connects two clients (one authed, one anonymous) to verify identity is
// derived from the JWT and not from client-supplied fields.

describe('ChatService — identity from JWT', () => {
  let httpServer: Server;
  let port: number;
  let adminToken: string;

  beforeAll(async () => {
    httpServer = createServer();
    new ChatService(httpServer);
    await authService.createAdminIfNotExists();
    const token = await authService.loginUser({
      username: 'admin',
      password: 'adminpassword',
    });
    expect(token).toBeTruthy();
    adminToken = token!;
    await new Promise<void>((resolve) =>
      httpServer.listen(0, () => {
        port = (httpServer.address() as AddressInfo).port;
        resolve();
      })
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function connect(): Socket {
    return Client(`http://localhost:${port}`, {
      transports: ['websocket'],
      reconnection: false,
    });
  }

  function once<T>(socket: Socket, event: string): Promise<T> {
    return new Promise<T>((resolve) => {
      socket.once(event, (data: T) => resolve(data));
    });
  }

  it('registers an authenticated user with JWT-derived username + roles', async () => {
    const socket = connect();
    await once(socket, 'connect');
    socket.emit('register', { token: adminToken });
    const reg = await once<{
      userId: string;
      username: string;
      isAuthenticated: boolean;
      roles: string[];
    }>(socket, 'registered');

    expect(reg.username).toBe('admin');
    expect(reg.isAuthenticated).toBe(true);
    expect(reg.roles).toContain('admin');
    expect(reg.roles).toContain('moderator');
    socket.disconnect();
  });

  it('registers anonymously when no token is provided (no privileged roles)', async () => {
    const socket = connect();
    await once(socket, 'connect');
    socket.emit('register', {});
    const reg = await once<{
      username: string;
      isAuthenticated: boolean;
      roles: string[];
    }>(socket, 'registered');

    expect(reg.username).toMatch(/^anon-/);
    expect(reg.isAuthenticated).toBe(false);
    expect(reg.roles).toEqual(['viewer']);
    socket.disconnect();
  });

  it('rejects a bad token with an error event', async () => {
    const socket = connect();
    await once(socket, 'connect');
    socket.emit('register', { token: 'not-a-real-jwt' });
    const err = await once<{ message: string }>(socket, 'error');
    expect(err.message).toMatch(/invalid|expired/i);
    socket.disconnect();
  });

  it('client-supplied "admin" username on an anonymous register is ignored', async () => {
    const socket = connect();
    await once(socket, 'connect');
    // Old API accepted a username here — current code should ignore it
    // and derive the identity from the JWT (absent → anon).
    socket.emit('register', { username: 'admin' } as any);
    const reg = await once<{ username: string; roles: string[] }>(socket, 'registered');
    expect(reg.username).not.toBe('admin');
    expect(reg.roles).toEqual(['viewer']);
    socket.disconnect();
  });
});
