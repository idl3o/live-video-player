// File: authMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';
import { UserRole } from '../models/User';

// Initialize AuthService
const authService = new AuthService();

// Extend Express Request interface to include user session
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        username: string;
        role: UserRole;
        streamKey?: string;
        allowedToStream: boolean;
      }
    }
  }
}

/**
 * Authentication middleware that verifies JWT token
 */
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
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
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};

/**
 * Middleware to check if user has required role
 */
export const authorize = (roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

/**
 * Middleware to check if user can stream
 */
export const canStream = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!req.user.allowedToStream) {
    return res.status(403).json({ error: 'Not authorized to stream' });
  }

  next();
};

/**
 * Middleware to validate RTMP stream keys
 * This is used by node-media-server's auth hooks
 */
export const validateStreamKey = (streamPath: string): boolean => {
  // Extract stream key from path (format: /live/STREAM_KEY)
  const parts = streamPath.split('/');
  if (parts.length < 3 || parts[1] !== 'live') {
    return false;
  }
  
  const streamKey = parts[2];
  return authService.isValidStreamKey(streamKey);
};

export { authService };