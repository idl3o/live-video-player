import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './AuthService';
import { UserRole } from '../models/User';

describe('AuthService', () => {
  let auth: AuthService;

  beforeEach(() => {
    auth = new AuthService();
  });

  it('round-trips username/password: register → login → JWT verifies → /me works', async () => {
    const user = await auth.registerUser('alice', 'alice@example.com', 'hunter2', UserRole.STREAMER);
    expect(user).not.toBeNull();
    expect(user!.username).toBe('alice');
    expect(user!.allowedToStream).toBe(true);
    expect(user!.streamKey).toBeDefined();

    const token = await auth.loginUser({ username: 'alice', password: 'hunter2' });
    expect(token).toBeTruthy();

    const session = auth.verifyToken(token!);
    expect(session?.username).toBe('alice');
    expect(session?.role).toBe(UserRole.STREAMER);
    expect(session?.allowedToStream).toBe(true);

    const lookup = auth.getUserById(session!.userId);
    expect(lookup?.username).toBe('alice');
  });

  it('rejects login with wrong password', async () => {
    await auth.registerUser('bob', 'bob@example.com', 'correct', UserRole.VIEWER);
    expect(await auth.loginUser({ username: 'bob', password: 'wrong' })).toBeNull();
  });

  it('SIWE: getOrCreateByAddress is idempotent and lowercases the address', () => {
    const a = auth.getOrCreateByAddress('0xABCDEF0123456789ABCDEF0123456789ABCDEF01');
    const b = auth.getOrCreateByAddress('0xabcdef0123456789abcdef0123456789abcdef01');
    expect(a.userId).toBe(b.userId);
    expect(a.walletAddress).toBe('0xabcdef0123456789abcdef0123456789abcdef01');
    expect(a.role).toBe(UserRole.STREAMER);
    expect(a.allowedToStream).toBe(true);
    expect(a.streamKey).toBeDefined();
  });

  it('SIWE: nonces are minted per address and gc-d after TTL', () => {
    vi.useFakeTimers();
    const addr = '0x000000000000000000000000000000000000beef';
    const nonce1 = auth.createNonceFor(addr);
    expect(nonce1).toMatch(/^[a-zA-Z0-9]+$/);

    // Same address → fresh nonce each call (rotates on every request).
    const nonce2 = auth.createNonceFor(addr);
    expect(nonce2).not.toBe(nonce1);

    // Past TTL, next call should still produce a valid nonce (it just gc's expired ones).
    vi.advanceTimersByTime(10 * 60 * 1000);
    const nonce3 = auth.createNonceFor(addr);
    expect(nonce3).toBeTruthy();
    vi.useRealTimers();
  });

  it('isValidStreamKey gates publishing to known streamers only', async () => {
    const streamer = await auth.registerUser('caster', 'c@example.com', 'pw', UserRole.STREAMER);
    expect(auth.isValidStreamKey(streamer!.streamKey!)).toBe(true);
    expect(auth.isValidStreamKey('not-a-real-key')).toBe(false);
  });

  it('createAdminIfNotExists is idempotent', async () => {
    await auth.createAdminIfNotExists();
    await auth.createAdminIfNotExists();
    const token = await auth.loginUser({ username: 'admin', password: 'adminpassword' });
    expect(token).toBeTruthy();
    expect(auth.verifyToken(token!)?.role).toBe(UserRole.ADMIN);
  });
});
