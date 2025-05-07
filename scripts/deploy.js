#!/usr/bin/env node

/**
 * Deployment script for the live video player application
 * Supports deployment to common hosting platforms
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const rootDir = path.resolve(__dirname, '..');
const buildDir = path.join(rootDir, 'build');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

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
        reject(new Error(`${name} command failed with code ${code}`));
      }
    });
    
    childProcess.on('error', (err) => {
      console.error(`${colors.red}[${name}] Process error: ${err.message}${colors.reset}`);
      reject(err);
    });
  });
}

/**
 * Ask a question and get user input
 * @param {string} question - The question to ask
 * @param {string} defaultValue - Default value if user inputs nothing
 * @returns {Promise<string>} - The user's answer
 */
function askQuestion(question, defaultValue = '') {
  return new Promise((resolve) => {
    const defaultText = defaultValue ? ` (${defaultValue})` : '';
    rl.question(`${question}${defaultText}: `, (answer) => {
      resolve(answer || defaultValue);
    });
  });
}

/**
 * Choose from a list of options
 * @param {string} question - The question to ask
 * @param {Array<Object>} options - Array of options with name and value
 * @returns {Promise<string>} - The selected option's value
 */
async function chooseOption(question, options) {
  console.log(`\n${question}`);
  
  options.forEach((option, index) => {
    console.log(`${colors.cyan}${index + 1}${colors.reset}. ${option.name}`);
  });
  
  while (true) {
    const answer = await askQuestion('Enter your choice (number)');
    const index = parseInt(answer) - 1;
    
    if (!isNaN(index) && index >= 0 && index < options.length) {
      return options[index].value;
    } else {
      console.log(`${colors.red}Invalid choice. Please enter a number between 1 and ${options.length}${colors.reset}`);
    }
  }
}

/**
 * Ensure build exists
 */
function ensureBuildExists() {
  if (!fs.existsSync(buildDir) || !fs.existsSync(path.join(buildDir, 'server'))) {
    console.log(`${colors.yellow}Build directory not found or incomplete. Running build script...${colors.reset}`);
    
    // Run the build script first
    return runCommand('node', ['scripts/build.js'], rootDir, 'Build');
  }
  
  return Promise.resolve();
}

/**
 * Deploy to Heroku
 */
async function deployToHeroku() {
  console.log(`${colors.bright}${colors.magenta}Deploying to Heroku...${colors.reset}`);
  
  // Check if Heroku CLI is installed
  try {
    await runCommand('heroku', ['--version'], rootDir, 'Heroku Check');
  } catch (error) {
    console.error(`${colors.red}Heroku CLI is not installed. Please install it first: https://devcenter.heroku.com/articles/heroku-cli${colors.reset}`);
    process.exit(1);
  }
  
  const appName = await askQuestion('Enter your Heroku app name (or leave empty to create a new app)');
  
  // Create Heroku app if needed
  if (!appName) {
    console.log(`${colors.yellow}Creating new Heroku app...${colors.reset}`);
    await runCommand('heroku', ['create'], buildDir, 'Heroku Create');
  }
  
  // Configure buildpacks
  console.log(`${colors.yellow}Setting up Heroku buildpacks...${colors.reset}`);
  await runCommand('heroku', ['buildpacks:set', 'heroku/nodejs'], buildDir, 'Heroku Buildpack');
  
  // Set up environment variables
  console.log(`${colors.blue}Setting environment variables...${colors.reset}`);
  await runCommand('heroku', ['config:set', 'NODE_ENV=production'], buildDir, 'Heroku Config');
  
  const customPort = await askQuestion('Do you want to use a custom port? (y/N)');
  if (customPort.toLowerCase() === 'y') {
    const port = await askQuestion('Enter the port number for the API server', '45001');
    await runCommand('heroku', ['config:set', `PORT=${port}`], buildDir, 'Heroku Port Config');
  }
  
  // Initialize git if needed
  if (!fs.existsSync(path.join(buildDir, '.git'))) {
    console.log(`${colors.yellow}Initializing git repository in build directory...${colors.reset}`);
    await runCommand('git', ['init'], buildDir, 'Git Init');
    await runCommand('git', ['add', '.'], buildDir, 'Git Add');
    await runCommand('git', ['commit', '-m', '"Initial deployment"'], buildDir, 'Git Commit');
  }
  
  // Deploy to Heroku
  console.log(`${colors.bright}${colors.blue}Deploying application to Heroku...${colors.reset}`);
  const target = appName ? `heroku git:remote -a ${appName}` : 'git push heroku master';
  await runCommand('git', ['push', 'heroku', 'master', '--force'], buildDir, 'Heroku Deploy');
  
  console.log(`${colors.bright}${colors.green}Successfully deployed to Heroku!${colors.reset}`);
  
  // Open the app in browser
  const openApp = await askQuestion('Do you want to open the app in your browser? (Y/n)');
  if (openApp.toLowerCase() !== 'n') {
    await runCommand('heroku', ['open'], buildDir, 'Heroku Open');
  }
}

/**
 * Deploy to Vercel
 */
async function deployToVercel() {
  console.log(`${colors.bright}${colors.magenta}Deploying to Vercel...${colors.reset}`);
  
  // Check if Vercel CLI is installed
  try {
    await runCommand('vercel', ['--version'], rootDir, 'Vercel Check');
  } catch (error) {
    console.log(`${colors.yellow}Vercel CLI is not installed. Installing now...${colors.reset}`);
    await runCommand('npm', ['install', '-g', 'vercel'], rootDir, 'Vercel Install');
  }
  
  // Create vercel.json in build directory
  const vercelConfig = {
    version: 2,
    builds: [
      { src: "server/**/*.js", use: "@vercel/node" },
      { src: "public/**", use: "@vercel/static" }
    ],
    routes: [
      { handle: "filesystem" },
      { src: "/api/(.*)", dest: "server/server.js" },
      { src: "/(.*)", dest: "public/index.html" }
    ],
    env: {
      NODE_ENV: "production"
    }
  };
  
  fs.writeFileSync(
    path.join(buildDir, 'vercel.json'),
    JSON.stringify(vercelConfig, null, 2)
  );
  
  // Deploy to Vercel
  console.log(`${colors.blue}Starting Vercel deployment...${colors.reset}`);
  await runCommand('vercel', [], buildDir, 'Vercel Deploy');
  
  console.log(`${colors.bright}${colors.green}Vercel deployment started!${colors.reset}`);
}

/**
 * Deploy to custom server
 */
async function deployToCustomServer() {
  console.log(`${colors.bright}${colors.magenta}Preparing for custom server deployment...${colors.reset}`);
  
  // Create a deployable zip file
  const deployDir = path.join(rootDir, 'deploy');
  if (!fs.existsSync(deployDir)) {
    fs.mkdirSync(deployDir);
  }
  
  // Create zip file of the build folder
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const zipName = `live-video-player-${dateStr}.zip`;
  const zipPath = path.join(deployDir, zipName);
  
  console.log(`${colors.blue}Creating deployment package: ${zipPath}${colors.reset}`);
  
  // Using different zip tools based on platform
  if (process.platform === 'win32') {
    // Use PowerShell's Compress-Archive on Windows
    await runCommand(
      'powershell',
      ['-command', `Compress-Archive -Path "${buildDir}/*" -DestinationPath "${zipPath}" -Force`],
      rootDir,
      'Create Zip'
    );
  } else {
    // Use zip command on Unix-like systems
    await runCommand('zip', ['-r', zipPath, '.'], buildDir, 'Create Zip');
  }
  
  console.log(`${colors.bright}${colors.green}Deployment package created: ${zipPath}${colors.reset}`);
  console.log(`${colors.cyan}You can now upload this package to your custom server.${colors.reset}`);
  
  // Provide instructions for manual deployment
  console.log(`\n${colors.bright}Manual deployment instructions:${colors.reset}`);
  console.log(`${colors.cyan}1. Upload the zip file to your server${colors.reset}`);
  console.log(`${colors.cyan}2. Unzip the package: unzip ${zipName}${colors.reset}`);
  console.log(`${colors.cyan}3. Install dependencies: npm install --production${colors.reset}`);
  console.log(`${colors.cyan}4. Start the server: npm start${colors.reset}`);
  
  // Ask if the user wants to deploy via SCP/SSH
  const useSsh = await askQuestion('Do you want to deploy to a server via SSH/SCP? (y/N)');
  
  if (useSsh.toLowerCase() === 'y') {
    const host = await askQuestion('Enter server hostname or IP');
    const user = await askQuestion('Enter username');
    const path = await askQuestion('Enter target directory on server', '/var/www/live-video-player');
    
    console.log(`${colors.blue}Uploading package to ${user}@${host}:${path}...${colors.reset}`);
    
    // Create the target directory if it doesn't exist
    await runCommand(
      'ssh',
      ['-t', `${user}@${host}`, `"mkdir -p ${path}"`],
      rootDir,
      'SSH Mkdir'
    );
    
    // Upload the zip file
    await runCommand(
      'scp',
      [zipPath, `${user}@${host}:${path}`],
      rootDir,
      'SCP Upload'
    );
    
    // Extract and set up on the server
    console.log(`${colors.blue}Setting up the application on the server...${colors.reset}`);
    await runCommand(
      'ssh',
      [
        '-t', 
        `${user}@${host}`, 
        `"cd ${path} && unzip -o ${zipName} && npm install --production && echo 'Deployment completed!'"`
      ],
      rootDir,
      'SSH Setup'
    );
    
    console.log(`${colors.bright}${colors.green}Deployment completed successfully!${colors.reset}`);
  }
}

/**
 * Main deploy function
 */
async function deploy() {
  console.log(`${colors.bright}${colors.cyan}===== Live Video Player Deployment Tool =====${colors.reset}`);
  
  try {
    // Make sure the build exists
    await ensureBuildExists();
    
    // Ask which platform to deploy to
    const platform = await chooseOption('Where would you like to deploy?', [
      { name: 'Heroku (Node.js hosting with RTMP support via add-ons)', value: 'heroku' },
      { name: 'Vercel (Serverless deployment - limited RTMP support)', value: 'vercel' },
      { name: 'Custom server (Generate deployment package)', value: 'custom' }
    ]);
    
    // Deploy based on selected platform
    switch (platform) {
      case 'heroku':
        await deployToHeroku();
        break;
      case 'vercel':
        await deployToVercel();
        break;
      case 'custom':
        await deployToCustomServer();
        break;
    }
    
    console.log(`\n${colors.bright}${colors.green}Deployment process completed!${colors.reset}`);
    
  } catch (error) {
    console.error(`${colors.bright}${colors.red}❌ Deployment failed: ${error.message}${colors.reset}`);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Start deployment process
deploy();