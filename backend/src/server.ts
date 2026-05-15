import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import net from 'net';
import NodeMediaServer from 'node-media-server';
import dotenv from 'dotenv';
import { fileTypeFromBuffer } from 'file-type';
import { LoggerService } from './services/LoggerService';
import { authService } from './services/AuthService';
import { ChatService } from './services/ChatService';
import { IPFSService } from './services/IPFSService';
import { RecordingService } from './services/RecordingService';
import { authenticate } from './middleware/authMiddleware';
import { authRoutes } from './routes/authRoutes';

dotenv.config();

const API_PORT = parseInt(process.env.PORT || '45001', 10);
const RTMP_PORT = parseInt(process.env.RTMP_PORT || '45935', 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '45000', 10);

// Auth toggles. Defaults preserve the prior "publish requires token, play is open" behavior.
const REQUIRE_PUBLISH_AUTH = process.env.STREAM_AUTH_PUBLISH !== 'false';
const REQUIRE_PLAY_AUTH = process.env.STREAM_AUTH_PLAY === 'true';

function checkPortInUse(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', (err: NodeJS.ErrnoException) => resolve(err.code === 'EADDRINUSE'))
      .once('listening', () => tester.close(() => resolve(false)))
      .listen(port, host);
  });
}

const app = express();
app.use(cors());
app.use(express.json());

const http = require('http').createServer(app);

const mediaRoot = path.join(__dirname, '../media');
const recordingsPath = path.join(mediaRoot, 'recordings');
if (!fs.existsSync(recordingsPath)) {
  fs.mkdirSync(recordingsPath, { recursive: true });
}

const logger = new LoggerService('Server');
const chatService = new ChatService(http);
const ipfsService = new IPFSService(logger);
const recordingService = new RecordingService(logger, ipfsService);

(async () => {
  try {
    await ipfsService.initialize();
    logger.info('IPFS service initialized');
  } catch (err) {
    logger.error('Failed to initialize IPFS service', err);
  }
})();

// Node-Media-Server records each stream to mediaRoot/<app>/<stream>.mp4 when mp4=true.
// We listen for donePublish to know when ffmpeg has finished finalizing the file.
const nmsConfig = {
  rtmp: {
    port: RTMP_PORT,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
    host: '0.0.0.0',
  },
  http: {
    port: HTTP_PORT,
    allow_origin: '*',
    mediaroot: mediaRoot,
    cors: {
      enabled: true,
      origin: '*',
      methods: 'GET,PUT,POST,DELETE,OPTIONS',
      credentials: true,
      maxAge: 1728000,
    },
    host: '0.0.0.0',
  },
  auth: {
    play: REQUIRE_PLAY_AUTH,
    publish: REQUIRE_PUBLISH_AUTH,
    secret: process.env.STREAM_SECRET || 'nostreamsecret',
  },
  trans: {
    ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg',
    tasks: [
      {
        app: 'live',
        mp4: true,
        mp4Flags: '[movflags=frag_keyframe+empty_moov]',
      },
    ],
  },
  logType: 4,
};

app.use(express.static(path.join(__dirname, '../../')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../landing-page.html'));
});

app.get('/app', (req, res) => {
  res.redirect('http://localhost:3000');
});

const nms = new NodeMediaServer(nmsConfig);

process.on('uncaughtException', (error: any) => {
  logger.error('Uncaught exception', error);
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${error.port} is already in use. Close any applications using this port.`);
  }
});

function rejectSession(id: string, reason: string) {
  const session = (nms as any).getSession(id);
  if (session) session.reject();
  logger.info(`[Auth] ${reason}`);
}

nms.on('prePublish', (id, StreamPath, args) => {
  logger.info(`[prePublish] id=${id} path=${StreamPath}`);
  const [, app, streamKey] = StreamPath.split('/');

  if (app !== 'live') {
    logger.error(`[prePublish] Unexpected app name "${app}". Configure OBS server URL as rtmp://HOST:${RTMP_PORT}/live`);
  }
  if (!streamKey) {
    logger.error('[prePublish] Missing stream key in path');
  }

  if (!REQUIRE_PUBLISH_AUTH) return;

  const token = args?.query?.token;
  if (!token) {
    rejectSession(id, `publish rejected for ${StreamPath} — no token`);
    return;
  }
  try {
    if (!authService.verifyStreamToken(token)) {
      rejectSession(id, `publish rejected for ${StreamPath} — invalid token`);
      return;
    }
    logger.info(`[prePublish] authorized ${StreamPath}`);
  } catch (err) {
    rejectSession(id, `publish rejected for ${StreamPath} — verification error`);
  }
});

nms.on('prePlay', (id, StreamPath, args) => {
  logger.info(`[prePlay] id=${id} path=${StreamPath}`);

  if (!REQUIRE_PLAY_AUTH) return;

  const token = args?.query?.token;
  if (!token) {
    rejectSession(id, `play rejected for ${StreamPath} — no token`);
    return;
  }
  try {
    if (!authService.verifyStreamToken(token)) {
      rejectSession(id, `play rejected for ${StreamPath} — invalid token`);
      return;
    }
    logger.info(`[prePlay] authorized ${StreamPath}`);
  } catch (err) {
    rejectSession(id, `play rejected for ${StreamPath} — verification error`);
  }
});

nms.on('postPublish', (id, StreamPath) => {
  logger.info(`[postPublish] path=${StreamPath}`);
  const result = recordingService.configureRecording(StreamPath);
  if (result.success) {
    logger.info(`Recording configured for ${StreamPath} -> ${result.recordingPath}`);
  } else {
    logger.error(`Recording config failed: ${result.error}`);
  }
});

// donePublish fires when the publisher disconnects. NMS finalizes the mp4 task shortly after.
// We poll briefly for the expected file (in mediaRoot/<app>/<stream>.mp4), then process it.
nms.on('donePublish', async (id, StreamPath) => {
  logger.info(`[donePublish] path=${StreamPath}`);
  const [, app, streamKey] = StreamPath.split('/');
  if (!streamKey) return;

  const nmsRecordingPath = path.join(mediaRoot, app, `${streamKey}.mp4`);

  // Poll up to 30s for ffmpeg to finalize the mp4 container.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (fs.existsSync(nmsRecordingPath)) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!fs.existsSync(nmsRecordingPath)) {
    logger.error(`[donePublish] expected recording not found: ${nmsRecordingPath}`);
    return;
  }

  // Move into the canonical recordings dir with a timestamped filename.
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const finalName = `${streamKey}-${timestamp}.mp4`;
  const finalPath = path.join(recordingsPath, finalName);
  try {
    fs.renameSync(nmsRecordingPath, finalPath);
  } catch (err) {
    logger.error(`[donePublish] failed to move recording`, err);
    return;
  }

  const result = await recordingService.handleRecordingComplete(finalPath);
  if (result.success && result.ipfsData) {
    logger.info(`Recording uploaded to IPFS: ${result.ipfsData.cid}`);
  } else if (!result.success) {
    logger.error(`Recording handling failed: ${result.error}`);
  }
});

async function startMediaServer() {
  logger.info(`Starting RTMP server on port ${RTMP_PORT}`);
  if (await checkPortInUse(RTMP_PORT)) {
    logger.error(`Port ${RTMP_PORT} already in use; RTMP server may fail to start`);
  }
  try {
    nms.run();
  } catch (err) {
    logger.error('Failed to start RTMP server', err);
  }
}
startMediaServer();

app.use('/api/auth', authRoutes);
app.use('/recordings', express.static(recordingsPath));

app.get('/api/streams', (req, res) => {
  const activeStreams = nms.getStreams();
  const streamData = Object.entries(activeStreams).map(([key, value]: [string, any]) => {
    const parts = key.split('/');
    const streamKey = parts[2];
    const streamer = streamKey ? authService.getUserByStreamKey(streamKey) : undefined;
    return {
      id: key,
      app: parts[1],
      stream: streamKey,
      streamerAddress: streamer?.walletAddress,
      streamerUsername: streamer?.username,
      publisher: value.publisher
        ? {
            type: value.publisher.type,
            clientId: value.publisher.clientId,
            ip: value.publisher.ip,
            audio: value.publisher.audio,
            video: value.publisher.video,
          }
        : null,
      subscribers: Object.keys(value.subscribers).length,
    };
  });
  res.json({ success: true, streams: streamData });
});

app.get('/api/users/:address/profile', (req, res) => {
  const addr = req.params.address.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(addr)) {
    return res.status(400).json({ error: 'Invalid address' });
  }
  const user = authService.findByAddress(addr);
  if (!user) return res.status(404).json({ error: 'Profile not found' });
  res.json({
    walletAddress: user.walletAddress,
    username: user.username,
    role: user.role,
    allowedToStream: user.allowedToStream,
  });
});

app.get('/api/recordings', authenticate, (req, res) => {
  res.json({ status: 'success', data: recordingService.getRecordings() });
});

app.post('/api/recordings/:filename/ipfs', authenticate, async (req, res) => {
  const result = await recordingService.uploadToIPFS(req.params.filename);
  if (result.success) {
    res.json({
      status: 'success',
      data: { cid: result.cid, url: result.url, filename: req.params.filename },
    });
  } else {
    res.status(400).json({ status: 'error', message: result.error });
  }
});

app.delete('/api/recordings/:filename', authenticate, (req, res) => {
  const result = recordingService.deleteRecording(req.params.filename);
  if (result.success) {
    res.json({ status: 'success', message: 'Recording deleted successfully' });
  } else {
    res.status(400).json({ status: 'error', message: result.error });
  }
});

app.get('/api/ipfs/status', (req, res) => {
  res.json({ status: 'success', data: ipfsService.getStatus() });
});

app.get('/api/ipfs/content/:cid', async (req, res) => {
  try {
    const content = await ipfsService.getContent(req.params.cid);
    const detected = await fileTypeFromBuffer(content);
    res.setHeader('Content-Type', detected ? detected.mime : 'application/octet-stream');
    res.send(content);
  } catch (err) {
    logger.error('Error retrieving content from IPFS', err);
    res.status(500).json({ status: 'error', message: 'Failed to retrieve content from IPFS' });
  }
});

app.post('/api/ipfs/pin', async (req, res) => {
  const { cid } = req.body;
  if (!cid) {
    return res.status(400).json({ status: 'error', message: 'CID is required' });
  }
  try {
    await ipfsService.pinContent(cid);
    res.json({ status: 'success', message: 'Content pinned successfully' });
  } catch (err) {
    logger.error('Error pinning content to IPFS', err);
    res.status(500).json({ status: 'error', message: 'Failed to pin content to IPFS' });
  }
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down');
  try {
    await ipfsService.stop();
  } catch (err) {
    logger.error('Error stopping IPFS', err);
  }
  http.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

http.listen(API_PORT, () => {
  logger.info(`API server running on port ${API_PORT}`);
});
