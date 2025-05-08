import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import NodeMediaServer from 'node-media-server';
import { LoggerService } from './services/LoggerService';
import { AuthService } from './services/AuthService';
import { ChatService } from './services/ChatService';
import { IPFSService } from './services/IPFSService';
import { RecordingService } from './services/RecordingService';
import authMiddleware from './middleware/authMiddleware';
import authRoutes from './routes/authRoutes';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

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

// Initialize services
const logger = new LoggerService('Server');
const authService = new AuthService();
const chatService = new ChatService(http);
const ipfsService = new IPFSService(logger);
const recordingService = new RecordingService(logger, ipfsService);

// Initialize IPFS service
(async () => {
  try {
    await ipfsService.initialize();
    logger.info('IPFS service initialized');
  } catch (err) {
    logger.error('Failed to initialize IPFS service', err);
  }
})();

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

// IPFS API routes
app.get('/api/ipfs/status', authMiddleware, (req, res) => {
  const status = ipfsService.getStatus();
  res.json({
    status: 'success',
    data: status
  });
});

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
    logger.error('Error uploading to IPFS', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to upload to IPFS'
    });
  }
});

app.get('/api/ipfs/content/:cid', async (req, res) => {
  try {
    const { cid } = req.params;
    
    // Get content from IPFS
    const content = await ipfsService.getContent(cid);
    
    // Try to detect content type
    const detectedType = await fileTypeFromBuffer(content);
    const contentType = detectedType ? detectedType.mime : 'application/octet-stream';
    
    res.setHeader('Content-Type', contentType);
    res.send(content);
  } catch (err) {
    logger.error('Error retrieving content from IPFS', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve content from IPFS'
    });
  }
});

app.post('/api/ipfs/pin', authMiddleware, async (req, res) => {
  try {
    const { cid } = req.body;
    
    if (!cid) {
      return res.status(400).json({
        status: 'error',
        message: 'CID is required'
      });
    }
    
    await ipfsService.pinContent(cid);
    
    res.json({
      status: 'success',
      message: 'Content pinned successfully'
    });
  } catch (err) {
    logger.error('Error pinning content to IPFS', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to pin content to IPFS'
    });
  }
});

// Recording API routes
app.get('/api/recordings', authMiddleware, (req, res) => {
  const recordings = recordingService.getRecordings();
  res.json({
    status: 'success',
    data: recordings
  });
});

app.post('/api/recordings/:filename/ipfs', authMiddleware, async (req, res) => {
  const { filename } = req.params;
  
  try {
    const result = await recordingService.uploadToIPFS(filename);
    
    if (result.success) {
      res.json({
        status: 'success',
        data: {
          cid: result.cid,
          url: result.url,
          filename
        }
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: result.error
      });
    }
  } catch (error) {
    logger.error('Recording upload error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to upload recording to IPFS'
    });
  }
});

app.delete('/api/recordings/:filename', authMiddleware, (req, res) => {
  const { filename } = req.params;
  
  const result = recordingService.deleteRecording(filename);
  
  if (result.success) {
    res.json({
      status: 'success',
      message: 'Recording deleted successfully'
    });
  } else {
    res.status(400).json({
      status: 'error',
      message: result.error
    });
  }
});

// Configure automatic recording for streams
nms.on('postPublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on postPublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
  
  // Configure recording for the stream
  const recordingConfig = recordingService.configureRecording(StreamPath);
  
  if (recordingConfig.success && recordingConfig.recordingPath) {
    // Here you would typically use the recording path to set up ffmpeg recording
    logger.info(`Started recording for stream ${StreamPath} to ${recordingConfig.recordingPath}`);
    
    // For development purposes, we'll simulate a recording completion after 60 seconds
    setTimeout(async () => {
      // This is where you'd handle the actual recording completion
      // In production, you'd tie this to the actual recording finish event
      const result = await recordingService.handleRecordingComplete(recordingConfig.recordingPath!, true);
      
      if (result.success && result.ipfsData) {
        logger.info(`Recording uploaded to IPFS: ${result.ipfsData.cid}`);
      } else if (result.error) {
        logger.error(`Recording error: ${result.error}`);
      }
    }, 60000); // 60 seconds simulation
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