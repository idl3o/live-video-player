import { describe, it, expect, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { authenticate, authService } from './authMiddleware.js';
import { UserRole } from '../models/User.js';

function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = (code: number) => {
    res._status = code;
    return res;
  };
  res.json = (body: unknown) => {
    res._body = body;
    return res;
  };
  return res as Response & { _status?: number; _body?: any };
}

describe('authenticate middleware', () => {
  beforeEach(async () => {
    // Singleton AuthService is reused — make sure admin exists for token issuance
    await authService.createAdminIfNotExists();
  });

  it('rejects missing Authorization header', () => {
    const res = mockRes();
    let called = false;
    authenticate(mockReq(), res, () => {
      called = true;
    });
    expect(called).toBe(false);
    expect(res._status).toBe(401);
  });

  it('rejects malformed Authorization header', () => {
    const res = mockRes();
    let called = false;
    authenticate(mockReq({ authorization: 'NotBearer xyz' }), res, () => {
      called = true;
    });
    expect(called).toBe(false);
    expect(res._status).toBe(401);
  });

  it('accepts a fresh JWT and attaches req.user', async () => {
    const token = await authService.loginUser({ username: 'admin', password: 'adminpassword' });
    expect(token).toBeTruthy();

    const req = mockReq({ authorization: `Bearer ${token}` });
    const res = mockRes();
    let called = false;
    authenticate(req, res, () => {
      called = true;
    });
    expect(called).toBe(true);
    expect(res._status).toBeUndefined();
    expect((req as any).user?.username).toBe('admin');
    expect((req as any).user?.role).toBe(UserRole.ADMIN);
  });

  it('rejects an obviously invalid token', () => {
    const res = mockRes();
    let called = false;
    authenticate(mockReq({ authorization: 'Bearer not-a-jwt' }), res, () => {
      called = true;
    });
    expect(called).toBe(false);
    expect(res._status).toBe(401);
  });
});
