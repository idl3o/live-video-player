import express from 'express';
import { authService } from '../services/AuthService';
import { authenticate, authorize } from '../middleware/authMiddleware';
import { UserRole } from '../models/User';

const router = express.Router();

authService.createAdminIfNotExists().catch((err) => {
  console.error('Failed to create admin user:', err);
});

// SIWE: client requests a nonce keyed by their wallet address
router.get('/siwe/nonce', (req, res) => {
  const address = String(req.query.address || '').toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid address' });
  }
  const nonce = authService.createNonceFor(address);
  res.json({ nonce });
});

// SIWE: client posts the signed EIP-4361 message; we verify and return a JWT
router.post('/siwe/verify', async (req, res) => {
  const { message, signature } = req.body || {};
  if (typeof message !== 'string' || typeof signature !== 'string') {
    return res.status(400).json({ error: 'message and signature are required' });
  }
  const result = await authService.verifySiwe(message, signature);
  if (!result) return res.status(401).json({ error: 'SIWE verification failed' });
  res.json({ token: result.token, user: result.user.toJSON() });
});

// Legacy username/password registration — kept for the seeded admin and dev fallback
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const user = await authService.registerUser(username, email, password);
    if (!user) return res.status(409).json({ error: 'Username or email already exists' });
    return res.status(201).json({ message: 'User registered', user: user.toJSON() });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password' });
    }
    const token = await authService.loginUser({ username, password });
    if (!token) return res.status(401).json({ error: 'Invalid credentials' });
    return res.json({ token });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', authenticate, (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const user = authService.getUserById(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json(user.toJSON());
});

router.post(
  '/regenerate-stream-key',
  authenticate,
  authorize([UserRole.STREAMER, UserRole.ADMIN]),
  (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    const streamKey = authService.regenerateStreamKey(req.user.userId);
    if (!streamKey) return res.status(400).json({ error: 'Failed to regenerate stream key' });
    return res.json({ streamKey });
  }
);

router.post(
  '/create-streamer',
  authenticate,
  authorize([UserRole.ADMIN]),
  async (req, res) => {
    try {
      const { username, email, password } = req.body;
      if (!username || !email || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      const user = await authService.registerUser(username, email, password, UserRole.STREAMER);
      if (!user) return res.status(409).json({ error: 'Username or email already exists' });
      return res.status(201).json({ message: 'Streamer created', user: user.toJSON() });
    } catch (error) {
      console.error('Create streamer error:', error);
      return res.status(500).json({ error: 'Failed to create streamer' });
    }
  }
);

export { router as authRoutes };
