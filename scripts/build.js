#!/usr/bin/env node

/**
 * Build script for the live video player application
 * Builds both frontend and backend code for production
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');
const backendDir = path.join(rootDir, 'backend');

// Ensure build directory exists
const buildDir = path.join(rootDir, 'build');
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir);
}

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

console.log(`${colors.bright}${colors.cyan}===== Building Live Video Player for production =====${colors.reset}`);

/**
 * Run a command in a specific directory
 * @param {string} command - The command to run
 * @param {string} cwd - The directory to run the command in
 * @param {string} name - Name of the process (for logging)
 * @returns {Promise} - Resolves when command completes
 */
function runCommand(command, args, cwd, name) {
  return new Promise((resolve, reject) => {
    console.log(`${colors.yellow}[${name}] Running: ${command} ${args.join(' ')}${colors.reset}`);
    
    const childProcess = spawn(command, args, { 
      cwd,
      shell: true,
      stdio: 'inherit'
    });
    
    childProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`${colors.green}[${name}] Completed successfully${colors.reset}`);
        resolve();
      } else {
        console.error(`${colors.red}[${name}] Failed with code ${code}${colors.reset}`);
        reject(new Error(`${name} build failed with code ${code}`));
      }
    });
    
    childProcess.on('error', (err) => {
      console.error(`${colors.red}[${name}] Process error: ${err.message}${colors.reset}`);
      reject(err);
    });
  });
}

/**
 * Build the frontend application
 */
async function buildFrontend() {
  console.log(`${colors.bright}\n🔨 Building Frontend...${colors.reset}`);
  
  // Install dependencies if needed
  if (!fs.existsSync(path.join(frontendDir, 'node_modules'))) {
    console.log(`${colors.yellow}[Frontend] Installing dependencies...${colors.reset}`);
    await runCommand('npm', ['install'], frontendDir, 'Frontend');
  }
  
  // Run the build
  await runCommand('npm', ['run', 'build'], frontendDir, 'Frontend');
  
  // Copy the built files to the main build directory
  const frontendBuildDir = path.join(frontendDir, 'build');
  const frontendTargetDir = path.join(buildDir, 'public');
  
  if (!fs.existsSync(frontendTargetDir)) {
    fs.mkdirSync(frontendTargetDir, { recursive: true });
  }
  
  console.log(`${colors.yellow}[Frontend] Copying build files to ${frontendTargetDir}${colors.reset}`);
  
  // On Windows, use xcopy or robocopy
  if (process.platform === 'win32') {
    await runCommand('xcopy', 
      [frontendBuildDir, frontendTargetDir, '/E', '/I', '/Y'], 
      rootDir, 
      'Frontend Copy'
    );
  } else {
    // On Unix-like systems, use cp
    await runCommand('cp', 
      ['-R', frontendBuildDir + '/.', frontendTargetDir], 
      rootDir, 
      'Frontend Copy'
    );
  }
}

/**
 * Build the backend application
 */
async function buildBackend() {
  console.log(`${colors.bright}\n🔧 Building Backend...${colors.reset}`);
  
  // Install dependencies if needed
  if (!fs.existsSync(path.join(backendDir, 'node_modules'))) {
    console.log(`${colors.yellow}[Backend] Installing dependencies...${colors.reset}`);
    await runCommand('npm', ['install'], backendDir, 'Backend');
  }
  
  // Run the TypeScript compiler
  await runCommand('npm', ['run', 'build'], backendDir, 'Backend');
  
  // Copy the built files and package.json to the main build directory
  const backendBuildDir = path.join(backendDir, 'dist');
  const backendTargetDir = path.join(buildDir, 'server');
  
  if (!fs.existsSync(backendTargetDir)) {
    fs.mkdirSync(backendTargetDir, { recursive: true });
  }
  
  console.log(`${colors.yellow}[Backend] Copying build files to ${backendTargetDir}${colors.reset}`);
  
  // On Windows, use xcopy or robocopy
  if (process.platform === 'win32') {
    await runCommand('xcopy', 
      [backendBuildDir, backendTargetDir, '/E', '/I', '/Y'], 
      rootDir, 
      'Backend Copy'
    );
  } else {
    // On Unix-like systems, use cp
    await runCommand('cp', 
      ['-R', backendBuildDir + '/.', backendTargetDir], 
      rootDir, 
      'Backend Copy'
    );
  }
  
  // Copy package.json for dependencies
  console.log(`${colors.yellow}[Backend] Copying package.json${colors.reset}`);
  fs.copyFileSync(
    path.join(backendDir, 'package.json'),
    path.join(backendTargetDir, 'package.json')
  );
  
  // Create production package.json for the build folder
  const rootPackage = require(path.join(rootDir, 'package.json'));
  const productionPackage = {
    name: rootPackage.name || 'live-video-player',
    version: rootPackage.version || '1.0.0',
    description: 'Live Video Player - Production Build',
    main: 'server/server.js',
    scripts: {
      start: 'node server/server.js'
    },
    dependencies: {
      // Will be installed in the production environment
    },
    engines: {
      node: '>=14.0.0'
    }
  };
  
  fs.writeFileSync(
    path.join(buildDir, 'package.json'),
    JSON.stringify(productionPackage, null, 2)
  );
}

/**
 * Create README and start script
 */
function createHelperFiles() {
  console.log(`${colors.bright}\n📝 Creating helper files...${colors.reset}`);
  
  // Create README.md
  const readmeContent = `# Live Video Player - Production Build

This is the production build of the Live Video Player application.

## Setup

1. Run \`npm install\` in this directory to install dependencies
2. Configure environment variables if needed
3. Run \`npm start\` to start the server

The application will be available at http://localhost:45001 by default.

## Configuration

You can configure the following environment variables:

- \`PORT\`: The port for the API server (default: 45001)
- \`RTMP_PORT\`: The port for the RTMP server (default: 45935)
- \`HTTP_PORT\`: The port for the HTTP-FLV server (default: 45000)

`;

  fs.writeFileSync(path.join(buildDir, 'README.md'), readmeContent);
  
  // Create start script for Windows
  const cmdContent = `@echo off
echo Starting Live Video Player...
node server/server.js
`;

  fs.writeFileSync(path.join(buildDir, 'start.cmd'), cmdContent);
  
  // Create start script for Unix
  const shContent = `#!/bin/bash
echo "Starting Live Video Player..."
node server/server.js
`;

  fs.writeFileSync(path.join(buildDir, 'start.sh'), shContent);
  // Make the shell script executable on Unix-like systems
  if (process.platform !== 'win32') {
    fs.chmodSync(path.join(buildDir, 'start.sh'), '755');
  }
}

/**
 * Main build function
 */
async function build() {
  try {
    const startTime = new Date().getTime();
    
    // Build both frontend and backend
    await buildFrontend();
    await buildBackend();
    
    // Create helper files
    createHelperFiles();
    
    const endTime = new Date().getTime();
    const duration = (endTime - startTime) / 1000;
    
    console.log(`\n${colors.bright}${colors.green}✨ Build completed successfully in ${duration.toFixed(2)}s${colors.reset}`);
    console.log(`${colors.cyan}The production build is available in the "${buildDir}" directory${colors.reset}`);
    
  } catch (error) {
    console.error(`${colors.bright}${colors.red}❌ Build failed: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Start the build process
build();