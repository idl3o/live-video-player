import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';

export enum UserRole {
  VIEWER = 'viewer',
  STREAMER = 'streamer',
  ADMIN = 'admin',
}

export interface UserCredentials {
  username: string;
  password: string;
}

export interface UserSession {
  userId: string;
  username: string;
  role: UserRole;
  streamKey?: string;
  walletAddress?: string;
  allowedToStream: boolean;
  exp: number;
}

export interface UserData {
  userId: string;
  username: string;
  email?: string;
  passwordHash?: string;
  walletAddress?: string;
  streamKey?: string;
  role: UserRole;
  allowedToStream?: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class User implements UserData {
  userId: string;
  username: string;
  email: string;
  passwordHash: string;
  walletAddress?: string;
  streamKey?: string;
  role: UserRole;
  allowedToStream: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: Partial<UserData>) {
    this.userId = data.userId || uuidv4();
    this.username = data.username || (data.walletAddress ? `addr_${data.walletAddress.slice(2, 10)}` : '');
    this.email = data.email || '';
    this.passwordHash = data.passwordHash || '';
    this.walletAddress = data.walletAddress?.toLowerCase();
    this.role = data.role || UserRole.VIEWER;
    this.allowedToStream =
      data.allowedToStream ?? (this.role === UserRole.STREAMER || this.role === UserRole.ADMIN);
    this.streamKey =
      data.streamKey || (this.allowedToStream ? User.generateStreamKey() : undefined);
    this.lastLogin = data.lastLogin;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  static async create(
    username: string,
    email: string,
    password: string,
    role: UserRole = UserRole.VIEWER
  ): Promise<User> {
    const passwordHash = await bcrypt.hash(password, 10);
    return new User({ username, email, passwordHash, role });
  }

  static generateStreamKey(): string {
    return uuidv4().replace(/-/g, '');
  }

  async verifyPassword(password: string): Promise<boolean> {
    if (!this.passwordHash) return false;
    return bcrypt.compare(password, this.passwordHash);
  }

  regenerateStreamKey(): string {
    if (!this.allowedToStream) {
      throw new Error('User is not allowed to stream');
    }
    this.streamKey = User.generateStreamKey();
    this.updatedAt = new Date();
    return this.streamKey;
  }

  toJSON() {
    return {
      userId: this.userId,
      username: this.username,
      email: this.email || undefined,
      walletAddress: this.walletAddress,
      role: this.role,
      streamKey: this.streamKey,
      allowedToStream: this.allowedToStream,
      lastLogin: this.lastLogin,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
