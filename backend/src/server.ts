import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import NodeMediaServer from 'node-media-server';
import path from 'path';
import { execSync } from 'child_process';
import net from 'net';
import os from 'os';
import { exec } from 'child_process';
import util from 'util';
import http from 'http';

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
    play: false,
    publish: false,  // Set to false to disable authentication for testing
    secret: process.env.STREAM_SECRET || 'nostreamsecret' // Add for future use
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

// Add this more robust prePublish handler to better diagnose OBS connection issues
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
});

nms.on('postPublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on postPublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on donePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
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

// Initialize Express app
const app = express();

// Enhanced CORS configuration for Express
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// API endpoints
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Live Video Server is running' });
});

// Add endpoint to test RTMP connectivity with enhanced diagnostics
app.get('/api/test-rtmp', async (req, res) => {
  try {
    const client = new net.Socket();
    let isConnectable = false;
    const firewallTestComplete = false;
    
    // Try to detect firewall issues by measuring response time
    console.log(`[RTMP Test] Attempting to connect to RTMP server on port ${RTMP_PORT}...`);
    
    const testStart = Date.now();
    const testResult = await new Promise((resolve) => {
      client.connect(RTMP_PORT, '127.0.0.1', () => {
        isConnectable = true;
        const connectionTime = Date.now() - testStart;
        console.log(`[RTMP Test] Connected successfully in ${connectionTime}ms`);
        client.destroy();
        resolve({ 
          success: true, 
          message: 'RTMP server is accepting connections', 
          connectionTime,
          serverStatus: 'running'
        });
      });
      
      client.on('error', (err) => {
        const errorTime = Date.now() - testStart;
        console.error(`[RTMP Test] Connection failed: ${err.message} after ${errorTime}ms`);
        
        // Different error message based on error type
        let errorDetail = 'Unknown connection issue';
        let possibleSolution = 'Check server logs for more details';
        
        if (err.code === 'ECONNREFUSED') {
          errorDetail = 'Connection refused - RTMP server might not be running';
          possibleSolution = 'Ensure the RTMP server is started and bound to the correct port';
        } else if (err.code === 'ETIMEDOUT') {
          errorDetail = 'Connection timed out - Likely firewall blocking';
          possibleSolution = 'Check Windows Defender or other firewall settings';
        }
        
        resolve({ 
          success: false, 
          message: `Connection error: ${err.message}`, 
          error: err.message,
          errorCode: err.code,
          errorDetail,
          possibleSolution,
          responseTime: errorTime
        });
      });
      
      // Add timeout
      setTimeout(() => {
        if (!isConnectable) {
          console.error('[RTMP Test] Connection timed out after 3000ms - Likely firewall blocking');
          client.destroy();
          resolve({ 
            success: false, 
            message: 'Connection timed out', 
            errorDetail: 'Connection attempt timed out - Likely firewall blocking',
            possibleSolution: 'Check Windows Defender or other firewall settings',
            responseTime: 3000
          });
        }
      }, 3000);
    });
    
    // Check if RTMP server is actually running
    const rtmpServerRunning = isPortListening(RTMP_PORT);
    
    // Add additional information to help with debugging
    const responseData = {
      ...(testResult as any),
      rtmpPort: RTMP_PORT,
      serverRunning: rtmpServerRunning,
      portStatus: rtmpServerRunning ? 'listening' : 'not listening',
      testTimestamp: new Date().toISOString(),
      obsServerUrl: `rtmp://localhost:${RTMP_PORT}/live`,
      obsStreamKey: 'YOUR_STREAM_KEY',
      firewall: {
        status: 'unknown',
        checkMessage: 'Cannot automatically verify firewall settings'
      },
      troubleshooting: [
        'Check if OBS is configured with the correct RTMP URL format',
        `Ensure the URL in OBS is: rtmp://{server}:${RTMP_PORT}/live`,
        'Try connecting with a different network adapter/IP address',
        'Temporarily disable Windows Defender or other firewall software',
        `Run "netstat -ano | findstr :${RTMP_PORT}" to verify the port is listening`
      ]
    };
    
    res.status((testResult as any).success ? 200 : 500).json(responseData);
  } catch (error: unknown) {
    console.error('[RTMP Test] Failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to test RTMP connection', 
      error: error instanceof Error ? error.message : String(error),
      testTimestamp: new Date().toISOString()
    });
  }
});

// Add OBS-specific configuration information endpoint
app.get('/api/obs-config', async (req, res) => {
  try {
    // Get network interfaces
    const networkInterfaces = os.networkInterfaces();
    const serverAddresses: string[] = [];
    
    // Get all IPv4 addresses that aren't internal
    Object.keys(networkInterfaces).forEach((ifaceName) => {
      const iface = networkInterfaces[ifaceName];
      if (iface) {
        iface.forEach((details) => {
          if (details.family === 'IPv4' && !details.internal) {
            serverAddresses.push(details.address);
          }
        });
      }
    });
    
    // Add localhost
    serverAddresses.push('127.0.0.1');
    serverAddresses.push('localhost');
    
    // Get RTMP server status
    const rtmpServerRunning = nms ? true : false;
    const rtmpPort = nmsConfig.rtmp?.port || 1935;
    const httpPort = nmsConfig.http?.port || 8000;
    
    // Create OBS connection URLs
    const obsUrls = serverAddresses.map(addr => 
      `rtmp://${addr}:${rtmpPort}/live`
    );
    
    // Generate troubleshooting tips
    const tips = [
      'Ensure OBS is configured to use the correct RTMP URL',
      'Check that your stream key matches the expected format',
      'Verify that no firewall is blocking the RTMP port',
      'Ensure no other software is using the same port',
    ];
    
    // Test each address accessibility
    const connectionTestResults: Record<string, boolean> = {};
    
    // Return the data to client
    res.json({
      rtmp_server_status: rtmpServerRunning ? 'running' : 'stopped',
      http_server_status: 'running',
      rtmp_port: rtmpPort,
      http_port: httpPort,
      server_addresses: serverAddresses,
      obs_urls: obsUrls,
      troubleshooting_tips: tips,
      connection_test_results: connectionTestResults
    });
  } catch (error) {
    console.error('Error in OBS config endpoint:', error);
    res.status(500).json({ error: 'Failed to get server configuration' });
  }
});

// Add a connection test endpoint
app.post('/api/test-connection', async (req, res) => {
  try {
    const { url, streamKey } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    // Parse the URL
    let host: string, port: number;
    const rtmpMatch = url.match(/rtmp:\/\/([^:\/]+)(?::(\d+))?/);
    
    if (rtmpMatch) {
      host = rtmpMatch[1];
      port = rtmpMatch[2] ? parseInt(rtmpMatch[2]) : 1935;
    } else {
      return res.status(400).json({ error: 'Invalid RTMP URL format' });
    }
    
    // Test TCP connection to the RTMP port
    const socket = new net.Socket();
    let connectionSuccess = false;
    
    const connectionPromise = new Promise<void>((resolve, reject) => {
      socket.setTimeout(5000);
      
      socket.on('connect', () => {
        connectionSuccess = true;
        socket.end();
        resolve();
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Connection timeout'));
      });
      
      socket.on('error', (err) => {
        reject(err);
      });
      
      socket.connect(port, host);
    });
    
    try {
      await connectionPromise;
      res.json({
        success: connectionSuccess,
        message: 'Connection successful',
        target: { host, port }
      });
    } catch (error: any) {
      res.json({
        success: false,
        message: `Connection failed: ${error.message}`,
        target: { host, port }
      });
    }
  } catch (error: any) {
    console.error('Error testing connection:', error);
    res.status(500).json({ 
      error: 'Connection test failed',
      message: error.message
    });
  }
});

// Add a diagnostic tool endpoint
app.get('/api/diagnostics', async (req, res) => {
  try {
    const execPromise = util.promisify(exec);
    const diagnostics: Record<string, any> = {
      timestamp: new Date().toISOString(),
      os: {
        type: os.type(),
        platform: os.platform(),
        release: os.release(),
        arch: os.arch()
      },
      network: {
        interfaces: os.networkInterfaces()
      },
      rtmp_server: {
        running: nms ? true : false,
        config: nmsConfig
      }
    };
    
    // Check if ports are in use
    try {
      const { stdout: netstatOutput } = await execPromise('netstat -ano | findstr :1935');
      diagnostics.ports = {
        rtmp_port_check: netstatOutput.trim().split('\n')
      };
    } catch (error) {
      diagnostics.ports = {
        rtmp_port_check: 'No process using port 1935'
      };
    }
    
    res.json(diagnostics);
  } catch (error) {
    console.error('Error in diagnostics endpoint:', error);
    res.status(500).json({ error: 'Failed to run diagnostics' });
  }
});

// Start Express server
app.listen(API_PORT, () => {
  console.log(`API Server is running on port ${API_PORT}`);
  console.log(`RTMP Server is running on port ${nmsConfig.rtmp.port}`);
  console.log(`HTTP-FLV Server is running on port ${nmsConfig.http.port}`);
  console.log(`Stream a video using OBS: rtmp://localhost:${nmsConfig.rtmp.port}/live/STREAM_KEY`);
  console.log(`Watch a stream: http://localhost:${nmsConfig.http.port}/live/STREAM_KEY.flv`);
  console.log(`
  For OBS configuration, use the following settings:
  - Service: Custom...
  - Server: rtmp://<YOUR_SERVER_IP>:${nmsConfig.rtmp.port}/live
  - Stream Key: YOUR_STREAM_KEY

  Troubleshooting Tips:
  - Ensure no firewall is blocking port ${RTMP_PORT}
  - Try multiple server addresses if one doesn't work
  - Make sure 'live' is included in the RTMP URL path
  - Check Windows Defender or antivirus settings
  `);
});