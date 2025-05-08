// File: AuthService.ts
import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User, UserRole, UserCredentials, UserSession } from '../models/User';

// In a production environment, this would use a database
// For this demo, we'll use an in-memory store
const users: Map<string, User> = new Map();

// Secret for signing JWTs - in production, use environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
const TOKEN_EXPIRY = '24h'; // 24 hours
const SALT_ROUNDS = 10;

export class AuthService {
  /**
   * Register a new user
   */
  async registerUser(username: string, email: string, password: string, role: UserRole = UserRole.VIEWER): Promise<User | null> {
    // Check if user already exists
    const existingUser = Array.from(users.values()).find(u => 
      u.username === username || u.email === email
    );
    
    if (existingUser) {
      return null;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const streamKey = role === UserRole.STREAMER ? this.generateStreamKey() : undefined;
    
    const user = new User({
      username,
      email,
      passwordHash,
      role,
      streamKey,
      allowedToStream: role === UserRole.STREAMER || role === UserRole.ADMIN,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    users.set(user.userId, user);
    return user;
  }

  /**
   * Authenticate a user and return a JWT token
   */
  async loginUser(credentials: UserCredentials): Promise<string | null> {
    const user = Array.from(users.values()).find(u => 
      u.username === credentials.username
    );
    
    if (!user) {
      return null;
    }

    const passwordMatch = await bcrypt.compare(credentials.password, user.passwordHash);
    if (!passwordMatch) {
      return null;
    }

    // Update last login
    user.lastLogin = new Date();
    users.set(user.userId, user);

    // Create session payload for JWT
    const sessionData: UserSession = {
      userId: user.userId,
      username: user.username,
      role: user.role,
      streamKey: user.streamKey,
      allowedToStream: user.allowedToStream,
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) // 24 hours
    };

    // Generate and return JWT
    return jwt.sign(sessionData, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  }

  /**
   * Verify a JWT token and return the user session
   */
  verifyToken(token: string): UserSession | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as UserSession;
      return decoded;
    } catch (error) {
      console.error('Token verification failed:', error);
      return null;
    }
  }

  /**
   * Verify a stream token (used for RTMP authentication)
   */
  verifyStreamToken(token: string): boolean {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as UserSession;
      return decoded && decoded.allowedToStream ? true : false;
    } catch (error) {
      console.error('Stream token verification failed:', error);
      return false;
    }
  }

  /**
   * Get user by ID
   */
  getUserById(userId: string): User | undefined {
    return users.get(userId);
  }

  /**
   * Get user by stream key
   */
  getUserByStreamKey(streamKey: string): User | undefined {
    return Array.from(users.values()).find(u => u.streamKey === streamKey);
  }

  /**
   * Generate a unique stream key
   */
  generateStreamKey(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Regenerate stream key for a user
   */
  regenerateStreamKey(userId: string): string | null {
    const user = this.getUserById(userId);
    
    if (!user || !user.allowedToStream) {
      return null;
    }

    const newStreamKey = this.generateStreamKey();
    user.streamKey = newStreamKey;
    users.set(userId, user);
    
    return newStreamKey;
  }

  /**
   * Check if a stream key is valid
   */
  isValidStreamKey(streamKey: string): boolean {
    return Array.from(users.values()).some(u => 
      u.streamKey === streamKey && u.allowedToStream
    );
  }

  /**
   * Create an admin user if none exists (for initial setup)
   */
  async createAdminIfNotExists(): Promise<void> {
    const adminExists = Array.from(users.values()).some(u => u.role === UserRole.ADMIN);
    
    if (!adminExists) {
      await this.registerUser(
        'admin',
        'admin@example.com',
        'adminpassword',
        UserRole.ADMIN
      );
      console.log('Admin user created');
    }
  }
}