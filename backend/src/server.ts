import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import NodeMediaServer from 'node-media-server';
import { ChatService } from './services/ChatService';
import dotenv from 'dotenv';
import { execSync } from 'child_process';
import { authRoutes } from './routes/authRoutes';
import { authenticate as authMiddleware } from './middleware/authMiddleware';
import { AuthService } from './services/AuthService';
import { IPFSService } from './services/IPFSService';
import { LoggerService } from './services/LoggerService';

// Load environment variables
dotenv.config();

const API_PORT = parseInt(process.env.PORT || '45001', 10);
const RTMP_PORT = parseInt(process.env.RTMP_PORT || '45935', 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '45000', 10);

// Function to check if a port is in use
function isPortListening(port: number): boolean {
  try {
    const result = execSync(`netstat -ano | findstr :${port}`).toString();
    return result.includes('LISTENING');
  } catch (error) {
    return false;
  }
}

// Create Express application
const app = express();
app.use(cors());
app.use(express.json());

// Set up HTTP server
const http = require('http').createServer(app);
const PORT = process.env.PORT || 8000;

// Path for storing recorded streams
const recordingsPath = path.join(__dirname, '../media/recordings');

// Ensure recordings directory exists
if (!fs.existsSync(recordingsPath)) {
  fs.mkdirSync(recordingsPath, { recursive: true });
}

// Initialize required services
const logger = new LoggerService();
const authService = new AuthService();
const chatService = new ChatService(http);
const ipfsService = new IPFSService(logger);

// Configure Node-Media-Server for RTMP and HTTP-FLV with explicit host binding
const nmsConfig = {
  rtmp: {
    port: RTMP_PORT,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
    host: '0.0.0.0',  // Explicitly bind to all network interfaces
    allow_origin: '*' // Add explicit CORS for RTMP
  },
  http: {
    port: HTTP_PORT,
    allow_origin: '*',
    mediaroot: path.join(__dirname, '../media'),
    cors: {
      enabled: true,
      origin: '*',
      methods: 'GET,PUT,POST,DELETE,OPTIONS',
      credentials: true,
      maxAge: 1728000
    },
    host: '0.0.0.0'  // Explicitly bind to all network interfaces
  },
  auth: {
    play: true,      // Enable authentication for playback
    publish: true,   // Enable authentication for publishing
    secret: process.env.STREAM_SECRET || 'nostreamsecret'
  },
  trans: {
    ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg',
    tasks: []
  },
  logType: 4 // Add more verbose logging for node-media-server
};

// Initialize Node-Media-Server with error handling
const nms = new NodeMediaServer(nmsConfig);

// Add enhanced error handling for the Node-Media-Server
process.on('uncaughtException', (error: any) => {
  console.error('[Critical Error]', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`[Port Conflict] Port ${error.port} is already in use. Please close any applications using this port.`);
  }
});

// Add event handlers for better debugging
nms.on('preConnect', (id, args) => {
  console.log('[NodeEvent on preConnect]', `id=${id} args=${JSON.stringify(args)}`);
  console.log('[RTMP Connection Attempt] Client attempting to connect');
});

nms.on('postConnect', (id, args) => {
  console.log('[NodeEvent on postConnect]', `id=${id} args=${JSON.stringify(args)}`);
  console.log('[RTMP Connection Success] Client connected successfully');
});

nms.on('doneConnect', (id, args) => {
  console.log('[NodeEvent on doneConnect]', `id=${id} args=${JSON.stringify(args)}`);
  if (args.reason) {
    console.log(`[RTMP Connection Closed] Reason: ${args.reason}`);
  }
});

// Update prePublish handler with authentication
nms.on('prePublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on prePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
  
  // Enhanced OBS detection and logging
  const isObs = args?.encoder?.includes && (
    args.encoder.includes('obs') || 
    args.encoder.includes('OBS') ||
    args.encoder.includes('librtmp')
  );
  
  if (isObs) {
    console.log(`[OBS Connection] Detected OBS stream publishing to ${StreamPath}`);
  } else {
    console.log(`[Stream Publishing] Client attempting to publish to ${StreamPath}`);
    console.log(`[Stream Client Info] ${JSON.stringify(args)}`);
  }
  
  // Detailed path analysis to help with debugging
  const pathParts = StreamPath.split('/');
  console.log(`[Stream Path Analysis] App=${pathParts[1] || 'unknown'}, Stream Key=${pathParts[2] || 'unknown'}`);
  
  // Validate the stream path format
  if (!pathParts[1] || pathParts[1] !== 'live') {
    console.warn(`[Warning] Stream path does not use the expected 'live' application name. Got: ${pathParts[1] || 'none'}`);
    console.warn(`[Hint] Make sure OBS is configured with: rtmp://SERVER_ADDRESS:${RTMP_PORT}/live as the server URL`);
  }
  
  if (!pathParts[2]) {
    console.warn(`[Warning] No stream key detected in the path. The stream might not be accessible.`);
    console.warn(`[Hint] Make sure OBS has a stream key configured`);
  }
  
  // Authentication check for publishing streams
  if (nmsConfig.auth.publish) {
    let streamKey = pathParts[2];
    
    // If there's a query string with token, extract it
    if (args.query && args.query.token) {
      try {
        const verified = authService.verifyStreamToken(args.query.token);
        if (!verified) {
          let session = nms.getSession(id);
          session.reject();
          console.log('[Authentication] Stream rejected - invalid token');
          return;
        }
        console.log('[Authentication] Stream authorized with valid token');
      } catch (error) {
        let session = nms.getSession(id);
        session.reject();
        console.log('[Authentication] Stream rejected - token verification error');
        return;
      }
    } else {
      // Legacy stream key check (you can implement your own logic here)
      let session = nms.getSession(id);
      session.reject();
      console.log('[Authentication] Stream rejected - no token provided');
      return;
    }
  }
});

nms.on('postPublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on postPublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on donePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

// Update prePlay handler with authentication
nms.on('prePlay', (id, StreamPath, args) => {
  console.log('[NodeEvent on prePlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
  
  // Authentication check for viewing streams
  if (nmsConfig.auth.play) {
    // If there's a query string with token, extract it
    if (args.query && args.query.token) {
      try {
        const verified = authService.verifyStreamToken(args.query.token);
        if (!verified) {
          let session = nms.getSession(id);
          session.reject();
          console.log('[Authentication] Stream playback rejected - invalid token');
          return;
        }
        console.log('[Authentication] Stream playback authorized with valid token');
      } catch (error) {
        let session = nms.getSession(id);
        session.reject();
        console.log('[Authentication] Stream playback rejected - token verification error');
        return;
      }
    } else {
      // For demo purposes, we can make it more permissive for playback
      console.log('[Authentication] Stream playback allowed without token (demo mode)');
      // If you want to enforce authentication:
      // let session = nms.getSession(id);
      // session.reject();
      // console.log('[Authentication] Stream playback rejected - no token provided');
      // return;
    }
  }
});

// Run the server with proper error handling and connection verification
try {
  console.log(`[RTMP] Starting RTMP server on port ${RTMP_PORT}...`);
  
  // Check if port is already in use before starting
  if (isPortListening(RTMP_PORT)) {
    console.error(`[RTMP] Port ${RTMP_PORT} is already in use! Server may not start correctly.`);
  }
  
  nms.run();
  
  // Give it a moment to start and verify it's actually listening
  setTimeout(() => {
    if (isPortListening(RTMP_PORT)) {
      console.log(`[RTMP] Server successfully started and verified listening on port ${RTMP_PORT}`);
    } else {
      console.error(`[RTMP] Server not detected on port ${RTMP_PORT} after startup! Check for errors.`);
    }
  }, 2000);
} catch (error) {
  console.error(`[RTMP] Failed to start server: ${error}`);
}

// IPFS initialization
// Initialize IPFS node - attempt connection to local Kubo node first, then fall back to embedded node if needed
(async () => {
  try {
    // Try to connect to local Kubo IPFS node (from ipfs directory)
    const connected = await ipfsService.connectToExternalNode('http://localhost:5001');
    
    if (!connected) {
      // Fall back to embedded node if external connection fails
      console.log('[IPFS] Could not connect to external IPFS node, starting embedded node');
      await ipfsService.startEmbeddedNode();
    }
    
    console.log('[IPFS] Service initialized successfully');
  } catch (error) {
    console.error('[IPFS] Failed to initialize IPFS service', error);
  }
})();

// API Routes
app.use('/api/auth', authRoutes);

// Protect API routes that need authentication
app.use('/api/streams', authMiddleware, (req, res, next) => {
  // Your protected stream routes
  next();
});

// API endpoint for retrieving active streams
app.get('/api/streams', (req, res) => {
  const activeStreams = nms.getStreams();
  
  const streamData = Object.entries(activeStreams).map(([key, value]) => {
    const parts = key.split('/');
    return {
      id: key,
      app: parts[1],
      stream: parts[2],
      publisher: value.publisher ? {
        type: value.publisher.type,
        clientId: value.publisher.clientId,
        ip: value.publisher.ip,
        audio: value.publisher.audio,
        video: value.publisher.video
      } : null,
      subscribers: Object.keys(value.subscribers).length
    };
  });
  
  res.json({
    success: true,
    streams: streamData
  });
});

// IPFS API Routes
app.get('/api/ipfs/status', (req, res) => {
  const status = ipfsService.getStatus();
  res.json({
    status: 'success',
    data: {
      ...status,
      gateway: ipfsService.getGatewayUrl('')
    }
  });
});

// Upload recording to IPFS
app.post('/api/ipfs/upload', authMiddleware, async (req, res) => {
  try {
    const { recordingPath } = req.body;
    
    if (!recordingPath) {
      return res.status(400).json({
        status: 'error',
        message: 'Recording path is required'
      });
    }
    
    const fullPath = path.join(__dirname, '..', 'media', 'recordings', recordingPath);
    
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({
        status: 'error',
        message: 'Recording not found'
      });
    }
    
    // Add file to IPFS
    const cid = await ipfsService.addFile(fullPath);
    
    // Return CID and gateway URL
    res.json({
      status: 'success',
      data: {
        cid,
        url: ipfsService.getGatewayUrl(cid),
        filename: path.basename(recordingPath)
      }
    });
  } catch (error) {
    console.error('[IPFS] Upload error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to upload to IPFS'
    });
  }
});

// Retrieve content from IPFS
app.get('/api/ipfs/content/:cid', async (req, res) => {
  try {
    const { cid } = req.params;
    
    if (!cid) {
      return res.status(400).json({
        status: 'error',
        message: 'CID is required'
      });
    }
    
    // Get content from IPFS
    const content = await ipfsService.getContent(cid);
    
    // Determine content type from first few bytes or default to octet-stream
    let contentType = 'application/octet-stream';
    if (content.length > 4) {
      const header = content.slice(0, 4).toString('hex');
      if (header.startsWith('ffd8')) {
        contentType = 'image/jpeg';
      } else if (header === '89504e47') {
        contentType = 'image/png';
      } else if (header.startsWith('424d')) {
        contentType = 'image/bmp';
      } else if (header.startsWith('47494638')) {
        contentType = 'image/gif';
      } else if (header.startsWith('25504446')) {
        contentType = 'application/pdf';
      } else if (header.startsWith('504b0304')) {
        contentType = 'application/zip';
      } else if (content.slice(0, 15).toString().includes('<!DOCTYPE html')) {
        contentType = 'text/html';
      } else if (content.length > 32 && content.slice(4, 12).toString() === 'ftypmp4') {
        contentType = 'video/mp4';
      } else if (content.length > 32 && content.slice(4, 8).toString() === 'ftyp') {
        contentType = 'video/mp4';
      } else if (content.slice(0, 4).toString() === 'RIFF' && content.slice(8, 12).toString() === 'WAVE') {
        contentType = 'audio/wav';
      }
    }
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', content.length);
    res.send(content);
  } catch (error) {
    console.error('[IPFS] Content retrieval error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve content from IPFS'
    });
  }
});

// Pin content to IPFS node
app.post('/api/ipfs/pin', authMiddleware, async (req, res) => {
  try {
    const { cid } = req.body;
    
    if (!cid) {
      return res.status(400).json({
        status: 'error',
        message: 'CID is required'
      });
    }
    
    // Pin content
    await ipfsService.pinContent(cid);
    
    res.json({
      status: 'success',
      message: 'Content pinned successfully',
      data: { cid }
    });
  } catch (error) {
    console.error('[IPFS] Pin error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to pin content'
    });
  }
});

// Graceful shutdown to properly close IPFS node
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully');
  
  // Stop IPFS node
  await ipfsService.stop();
  
  // Close HTTP server
  http.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

// Start the HTTP server for API and Chat
http.listen(API_PORT, () => {
  console.log(`[API] Server is running on port ${API_PORT}`);
});