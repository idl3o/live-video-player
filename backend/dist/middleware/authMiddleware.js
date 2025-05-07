"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = exports.validateStreamKey = exports.canStream = exports.authorize = exports.authenticate = void 0;
const AuthService_1 = require("../services/AuthService");
// Initialize AuthService
const authService = new AuthService_1.AuthService();
exports.authService = authService;
/**
 * Authentication middleware that verifies JWT token
 */
const authenticate = (req, res, next) => {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        // Extract token
        const token = authHeader.split(' ')[1];
        // Verify token
        const session = authService.verifyToken(token);
        if (!session) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        // Attach user to request
        req.user = {
            userId: session.userId,
            username: session.username,
            role: session.role,
            streamKey: session.streamKey,
            allowedToStream: session.allowedToStream
        };
        next();
    }
    catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({ error: 'Authentication error' });
    }
};
exports.authenticate = authenticate;
/**
 * Middleware to check if user has required role
 */
const authorize = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
};
exports.authorize = authorize;
/**
 * Middleware to check if user can stream
 */
const canStream = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    if (!req.user.allowedToStream) {
        return res.status(403).json({ error: 'Not authorized to stream' });
    }
    next();
};
exports.canStream = canStream;
/**
 * Middleware to validate RTMP stream keys
 * This is used by node-media-server's auth hooks
 */
const validateStreamKey = (streamPath) => {
    // Extract stream key from path (format: /live/STREAM_KEY)
    const parts = streamPath.split('/');
    if (parts.length < 3 || parts[1] !== 'live') {
        return false;
    }
    const streamKey = parts[2];
    return authService.isValidStreamKey(streamKey);
};
exports.validateStreamKey = validateStreamKey;
