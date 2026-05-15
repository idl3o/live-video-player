import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { generateNonce, SiweMessage } from 'siwe';
import { User, UserRole, UserCredentials, UserSession } from '../models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
const SALT_ROUNDS = 10;
const NONCE_TTL_MS = 5 * 60 * 1000;

interface NonceEntry {
  nonce: string;
  expires: number;
}

export class AuthService {
  private users: Map<string, User> = new Map();
  private nonces: Map<string, NonceEntry> = new Map();

  async registerUser(
    username: string,
    email: string,
    password: string,
    role: UserRole = UserRole.VIEWER
  ): Promise<User | null> {
    const exists = Array.from(this.users.values()).find(
      (u) => u.username === username || (email && u.email === email)
    );
    if (exists) return null;

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = new User({ username, email, passwordHash, role });
    this.users.set(user.userId, user);
    return user;
  }

  async loginUser(credentials: UserCredentials): Promise<string | null> {
    const user = Array.from(this.users.values()).find((u) => u.username === credentials.username);
    if (!user) return null;

    const ok = await user.verifyPassword(credentials.password);
    if (!ok) return null;

    user.lastLogin = new Date();
    return this.issueJwt(user);
  }

  // SIWE: caller asks for a nonce, builds the message client-side, signs it, sends back here.
  createNonceFor(address: string): string {
    const addr = address.toLowerCase();
    this.gcNonces();
    const nonce = generateNonce();
    this.nonces.set(addr, { nonce, expires: Date.now() + NONCE_TTL_MS });
    return nonce;
  }

  async verifySiwe(rawMessage: string, signature: string): Promise<{ token: string; user: User } | null> {
    let parsed: SiweMessage;
    try {
      parsed = new SiweMessage(rawMessage);
    } catch {
      return null;
    }

    const addr = parsed.address.toLowerCase();
    const stored = this.nonces.get(addr);
    if (!stored || stored.expires < Date.now() || stored.nonce !== parsed.nonce) {
      return null;
    }

    const verified = await parsed.verify({ signature });
    if (!verified.success) return null;

    this.nonces.delete(addr);

    const user = this.getOrCreateByAddress(addr);
    user.lastLogin = new Date();
    return { token: this.issueJwt(user), user };
  }

  getOrCreateByAddress(address: string): User {
    const addr = address.toLowerCase();
    const existing = this.findByAddress(addr);
    if (existing) return existing;

    const user = new User({
      walletAddress: addr,
      role: UserRole.STREAMER, // wallet users can stream by default; downgrade later if needed
    });
    this.users.set(user.userId, user);
    return user;
  }

  findByAddress(address: string): User | undefined {
    const addr = address.toLowerCase();
    return Array.from(this.users.values()).find((u) => u.walletAddress === addr);
  }

  verifyToken(token: string): UserSession | null {
    try {
      return jwt.verify(token, JWT_SECRET) as UserSession;
    } catch {
      return null;
    }
  }

  verifyStreamToken(token: string): boolean {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as UserSession;
      return !!(decoded && decoded.allowedToStream);
    } catch {
      return false;
    }
  }

  getUserById(userId: string): User | undefined {
    return this.users.get(userId);
  }

  getUserByStreamKey(streamKey: string): User | undefined {
    return Array.from(this.users.values()).find((u) => u.streamKey === streamKey);
  }

  regenerateStreamKey(userId: string): string | null {
    const user = this.getUserById(userId);
    if (!user || !user.allowedToStream) return null;
    return user.regenerateStreamKey();
  }

  isValidStreamKey(streamKey: string): boolean {
    return Array.from(this.users.values()).some(
      (u) => u.streamKey === streamKey && u.allowedToStream
    );
  }

  async createAdminIfNotExists(): Promise<void> {
    const adminExists = Array.from(this.users.values()).some((u) => u.role === UserRole.ADMIN);
    if (!adminExists) {
      await this.registerUser('admin', 'admin@example.com', 'adminpassword', UserRole.ADMIN);
      console.log('Admin user created');
    }
  }

  private issueJwt(user: User): string {
    const session: UserSession = {
      userId: user.userId,
      username: user.username,
      role: user.role,
      streamKey: user.streamKey,
      walletAddress: user.walletAddress,
      allowedToStream: user.allowedToStream,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    };
    // Note: exp is set inside the payload — don't pass expiresIn or jsonwebtoken
    // throws "Bad expiresIn option the payload already has an exp property".
    return jwt.sign(session, JWT_SECRET);
  }

  private gcNonces(): void {
    const now = Date.now();
    for (const [addr, entry] of this.nonces.entries()) {
      if (entry.expires < now) this.nonces.delete(addr);
    }
  }
}

// Singleton — exported and reused by both the middleware and server.ts to avoid
// the previous bug where two AuthService instances had separate user Maps.
export const authService = new AuthService();
