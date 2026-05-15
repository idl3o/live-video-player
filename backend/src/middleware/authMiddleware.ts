import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/AuthService';
import { UserRole } from '../models/User';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        username: string;
        role: UserRole;
        streamKey?: string;
        walletAddress?: string;
        allowedToStream: boolean;
      };
    }
  }
}

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    const session = authService.verifyToken(token);
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = {
      userId: session.userId,
      username: session.username,
      role: session.role,
      streamKey: session.streamKey,
      walletAddress: session.walletAddress,
      allowedToStream: session.allowedToStream,
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};

export const authorize = (roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

export const canStream = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (!req.user.allowedToStream) return res.status(403).json({ error: 'Not authorized to stream' });
  next();
};

export const validateStreamKey = (streamPath: string): boolean => {
  const parts = streamPath.split('/');
  if (parts.length < 3 || parts[1] !== 'live') return false;
  return authService.isValidStreamKey(parts[2]);
};

export { authService };
