// File: authRoutes.ts
import express from 'express';
import { authService } from '../middleware/authMiddleware';
import { authenticate, authorize } from '../middleware/authMiddleware';
import { UserRole } from '../models/User';

const router = express.Router();

// Create admin user on startup
authService.createAdminIfNotExists().catch(err => {
  console.error('Failed to create admin user:', err);
});

/**
 * User registration
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Register as viewer by default
    const user = await authService.registerUser(username, email, password);
    
    if (!user) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    
    // Don't return sensitive data
    const { passwordHash, ...userWithoutPassword } = user;
    
    return res.status(201).json({
      message: 'User registered successfully',
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * User login
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password' });
    }
    
    const token = await authService.loginUser({ username, password });
    
    if (!token) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    return res.json({ token });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * Get current user profile
 * GET /api/auth/me
 */
router.get('/me', authenticate, (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const user = authService.getUserById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Don't return sensitive data
    const { passwordHash, ...userWithoutPassword } = user;
    
    return res.json(userWithoutPassword);
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ error: 'Failed to get profile' });
  }
});

/**
 * Regenerate stream key (for streamers only)
 * POST /api/auth/regenerate-stream-key
 */
router.post('/regenerate-stream-key', 
  authenticate, 
  authorize([UserRole.STREAMER, UserRole.ADMIN]), 
  (req, res) => {
    try {
      if (!req.user || !req.user.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      const streamKey = authService.regenerateStreamKey(req.user.userId);
      
      if (!streamKey) {
        return res.status(400).json({ error: 'Failed to regenerate stream key' });
      }
      
      return res.json({ streamKey });
    } catch (error) {
      console.error('Regenerate stream key error:', error);
      return res.status(500).json({ error: 'Failed to regenerate stream key' });
    }
});

/**
 * Create streamer account (admin only)
 * POST /api/auth/create-streamer
 */
router.post('/create-streamer', 
  authenticate, 
  authorize([UserRole.ADMIN]), 
  async (req, res) => {
    try {
      const { username, email, password } = req.body;
      
      if (!username || !email || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const user = await authService.registerUser(username, email, password, UserRole.STREAMER);
      
      if (!user) {
        return res.status(409).json({ error: 'Username or email already exists' });
      }
      
      // Don't return sensitive data
      const { passwordHash, ...userWithoutPassword } = user;
      
      return res.status(201).json({
        message: 'Streamer created successfully',
        user: userWithoutPassword
      });
    } catch (error) {
      console.error('Create streamer error:', error);
      return res.status(500).json({ error: 'Failed to create streamer' });
    }
});

export { router as authRoutes };