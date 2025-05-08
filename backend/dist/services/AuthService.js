"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
// File: AuthService.ts
const crypto_1 = require("crypto");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = require("../models/User");
// In a production environment, this would use a database
// For this demo, we'll use an in-memory store
const users = new Map();
// Secret for signing JWTs - in production, use environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
const TOKEN_EXPIRY = '24h'; // 24 hours
const SALT_ROUNDS = 10;
class AuthService {
    /**
     * Register a new user
     */
    async registerUser(username, email, password, role = User_1.UserRole.VIEWER) {
        // Check if user already exists
        const existingUser = Array.from(users.values()).find(u => u.username === username || u.email === email);
        if (existingUser) {
            return null;
        }
        const passwordHash = await bcrypt_1.default.hash(password, SALT_ROUNDS);
        const streamKey = role === User_1.UserRole.STREAMER ? this.generateStreamKey() : undefined;
        const user = new User_1.User({
            username,
            email,
            passwordHash,
            role,
            streamKey,
            allowedToStream: role === User_1.UserRole.STREAMER || role === User_1.UserRole.ADMIN,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        users.set(user.userId, user);
        return user;
    }
    /**
     * Authenticate a user and return a JWT token
     */
    async loginUser(credentials) {
        const user = Array.from(users.values()).find(u => u.username === credentials.username);
        if (!user) {
            return null;
        }
        const passwordMatch = await bcrypt_1.default.compare(credentials.password, user.passwordHash);
        if (!passwordMatch) {
            return null;
        }
        // Update last login
        user.lastLogin = new Date();
        users.set(user.userId, user);
        // Create session payload for JWT
        const sessionData = {
            userId: user.userId,
            username: user.username,
            role: user.role,
            streamKey: user.streamKey,
            allowedToStream: user.allowedToStream,
            exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) // 24 hours
        };
        // Generate and return JWT
        return jsonwebtoken_1.default.sign(sessionData, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    }
    /**
     * Verify a JWT token and return the user session
     */
    verifyToken(token) {
        try {
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            return decoded;
        }
        catch (error) {
            console.error('Token verification failed:', error);
            return null;
        }
    }
    /**
     * Verify a stream token (used for RTMP authentication)
     */
    verifyStreamToken(token) {
        try {
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            return decoded && decoded.allowedToStream ? true : false;
        }
        catch (error) {
            console.error('Stream token verification failed:', error);
            return false;
        }
    }
    /**
     * Get user by ID
     */
    getUserById(userId) {
        return users.get(userId);
    }
    /**
     * Get user by stream key
     */
    getUserByStreamKey(streamKey) {
        return Array.from(users.values()).find(u => u.streamKey === streamKey);
    }
    /**
     * Generate a unique stream key
     */
    generateStreamKey() {
        return (0, crypto_1.randomBytes)(16).toString('hex');
    }
    /**
     * Regenerate stream key for a user
     */
    regenerateStreamKey(userId) {
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
    isValidStreamKey(streamKey) {
        return Array.from(users.values()).some(u => u.streamKey === streamKey && u.allowedToStream);
    }
    /**
     * Create an admin user if none exists (for initial setup)
     */
    async createAdminIfNotExists() {
        const adminExists = Array.from(users.values()).some(u => u.role === User_1.UserRole.ADMIN);
        if (!adminExists) {
            await this.registerUser('admin', 'admin@example.com', 'adminpassword', User_1.UserRole.ADMIN);
            console.log('Admin user created');
        }
    }
}
exports.AuthService = AuthService;
