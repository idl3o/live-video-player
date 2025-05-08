// File: User.ts
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';

export enum UserRole {
  VIEWER = 'viewer',
  STREAMER = 'streamer',
  ADMIN = 'admin'
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
  allowedToStream: boolean;
  exp: number;
}

export interface UserData {
  userId: string;
  username: string;
  email: string;
  passwordHash: string;
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
  streamKey?: string;
  role: UserRole;
  allowedToStream: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: Partial<UserData>) {
    this.userId = data.userId || uuidv4();
    this.username = data.username || '';
    this.email = data.email || '';
    this.passwordHash = data.passwordHash || '';
    this.streamKey = data.streamKey || (data.role === UserRole.STREAMER || data.role === UserRole.ADMIN ? this.generateStreamKey() : undefined);
    this.role = data.role || UserRole.VIEWER;
    this.allowedToStream = data.allowedToStream || (data.role === UserRole.STREAMER || data.role === UserRole.ADMIN);
    this.lastLogin = data.lastLogin;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  static async create(username: string, email: string, password: string, role: UserRole = UserRole.VIEWER): Promise<User> {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    return new User({
      username,
      email,
      passwordHash,
      role
    });
  }

  async verifyPassword(password: string): Promise<boolean> {
    return await bcrypt.compare(password, this.passwordHash);
  }

  regenerateStreamKey(): string {
    if (this.role !== UserRole.STREAMER && this.role !== UserRole.ADMIN) {
      throw new Error('Only streamers and admins can have stream keys');
    }
    this.streamKey = this.generateStreamKey();
    this.updatedAt = new Date();
    return this.streamKey;
  }

  private generateStreamKey(): string {
    // Generate a unique stream key using uuid
    return uuidv4().replace(/-/g, '');
  }

  toJSON() {
    return {
      userId: this.userId,
      username: this.username,
      email: this.email,
      role: this.role,
      streamKey: this.streamKey,
      allowedToStream: this.allowedToStream,
      lastLogin: this.lastLogin,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}