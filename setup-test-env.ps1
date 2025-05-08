# PowerShell Script to set up a local testing environment for live-video-player
# This script installs dependencies, builds the project, and sets up test data

# Parameters for customization
param(
    [switch]$SkipBackendBuild = $false,
    [switch]$SkipFrontendBuild = $false,
    [switch]$CleanInstall = $false,
    [switch]$Force = $false
)

$ErrorActionPreference = "Stop"
$WorkspaceRoot = $PSScriptRoot
$BackendPath = Join-Path $WorkspaceRoot "backend"
$FrontendPath = Join-Path $WorkspaceRoot "frontend"
$LogPath = Join-Path $WorkspaceRoot "test-env-setup.log"

# Clear log file if it exists
if (Test-Path $LogPath) {
    Clear-Content $LogPath
}

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp [$Level] $Message" | Out-File -Append -FilePath $LogPath
    
    switch ($Level) {
        "ERROR" { Write-Host $Message -ForegroundColor Red }
        "WARNING" { Write-Host $Message -ForegroundColor Yellow }
        "SUCCESS" { Write-Host $Message -ForegroundColor Green }
        default { Write-Host $Message }
    }
}

Write-Log "Starting setup of local testing environment for live-video-player" "INFO"

# Function to check for installed tools
function Test-Command {
    param(
        [string]$Command
    )
    
    $installed = $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
    return $installed
}

# Check for required tools
$nodeInstalled = Test-Command "node"
$npmInstalled = Test-Command "npm"
$ffmpegInstalled = Test-Command "ffmpeg"

if (-not $nodeInstalled) {
    Write-Log "Node.js is not installed. Please install Node.js before proceeding." "ERROR"
    exit 1
}

if (-not $npmInstalled) {
    Write-Log "npm is not installed. Please install npm before proceeding." "ERROR"
    exit 1
}

# Check Node.js version
$nodeVersion = node -v
$npmVersion = npm -v
Write-Log "Using Node.js $nodeVersion with npm $npmVersion" "INFO"

# Check for ffmpeg (required for video processing)
if (-not $ffmpegInstalled) {
    Write-Log "WARNING: ffmpeg is not installed or not in PATH. This is required for video transcoding." "WARNING"
    Write-Log "Installing ffmpeg via npm..." "INFO"
    
    try {
        # Install ffmpeg-static package
        Push-Location $BackendPath
        npm install ffmpeg-static --save
        Pop-Location
        Write-Log "Installed ffmpeg-static package" "SUCCESS"
    }
    catch {
        Write-Log "Failed to install ffmpeg-static package: $_" "ERROR"
        Write-Log "Please install ffmpeg manually and add it to your PATH" "ERROR"
    }
}
else {
    $ffmpegVersion = (ffmpeg -version) | Select-Object -First 1
    Write-Log "Found ffmpeg: $ffmpegVersion" "SUCCESS"
}

# Install root dependencies
Write-Log "Installing root project dependencies..." "INFO"
if ($CleanInstall) {
    # Remove node_modules and package-lock.json if clean install is requested
    if (Test-Path (Join-Path $WorkspaceRoot "node_modules")) {
        Remove-Item -Recurse -Force (Join-Path $WorkspaceRoot "node_modules")
    }
    if (Test-Path (Join-Path $WorkspaceRoot "package-lock.json")) {
        Remove-Item -Force (Join-Path $WorkspaceRoot "package-lock.json")
    }
    npm install
}
else {
    npm install
}
Write-Log "Root project dependencies installed" "SUCCESS"

# Install and build Backend
if (-not $SkipBackendBuild) {
    Write-Log "Setting up backend..." "INFO"
    Push-Location $BackendPath
    
    if ($CleanInstall) {
        # Remove node_modules and package-lock.json if clean install is requested
        if (Test-Path "node_modules") {
            Remove-Item -Recurse -Force "node_modules"
        }
        if (Test-Path "package-lock.json") {
            Remove-Item -Force "package-lock.json"
        }
    }
    
    # Install dependencies
    Write-Log "Installing backend dependencies..." "INFO"
    npm install
    Write-Log "Backend dependencies installed" "SUCCESS"
    
    # Build TypeScript code
    Write-Log "Building backend..." "INFO"
    npm run build
    Write-Log "Backend build complete" "SUCCESS"
    
    # Create needed directories if they don't exist
    if (-not (Test-Path "media/recordings")) {
        New-Item -Path "media/recordings" -ItemType Directory -Force
    }
    
    Pop-Location
}

# Install and build Frontend
if (-not $SkipFrontendBuild) {
    Write-Log "Setting up frontend..." "INFO"
    Push-Location $FrontendPath
    
    if ($CleanInstall) {
        # Remove node_modules and package-lock.json if clean install is requested
        if (Test-Path "node_modules") {
            Remove-Item -Recurse -Force "node_modules"
        }
        if (Test-Path "package-lock.json") {
            Remove-Item -Force "package-lock.json"
        }
    }
    
    # Install dependencies
    Write-Log "Installing frontend dependencies..." "INFO"
    npm install
    Write-Log "Frontend dependencies installed" "SUCCESS"
    
    # Build React app in development mode - we don't need a production build for testing
    Write-Log "Setting up frontend development environment..." "INFO"
    # We don't need to run the build for development testing since npm start will handle it
    Write-Log "Frontend development environment ready" "SUCCESS"
    
    Pop-Location
}

# Set up test data for easier testing
Write-Log "Setting up test data..." "INFO"

# Create .env file for backend if it doesn't exist
$envFile = Join-Path $BackendPath ".env"
if (-not (Test-Path $envFile)) {
    @"
# Environment Variables for Development Testing
PORT=45001
RTMP_PORT=45935
HTTP_PORT=45000
JWT_SECRET=your_dev_jwt_secret_key_replace_in_production
ADMIN_USERNAME=admin
ADMIN_PASSWORD=adminpassword
ADMIN_EMAIL=admin@example.com
DEBUG=true
CORS_ORIGIN=http://localhost:3000
"@ | Out-File -FilePath $envFile -Encoding utf8
    Write-Log "Created backend .env file with development settings" "SUCCESS"
}
else {
    Write-Log "Backend .env file already exists" "INFO"
}

# Create .env file for frontend if it doesn't exist
$frontendEnvFile = Join-Path $FrontendPath ".env.development.local"
if (-not (Test-Path $frontendEnvFile)) {
    @"
# Environment Variables for Development Testing
REACT_APP_API_URL=http://localhost:45001
REACT_APP_WEBSOCKET_URL=ws://localhost:45001
REACT_APP_HTTP_STREAM_URL=http://localhost:45000
REACT_APP_RTMP_URL=rtmp://localhost:45935/live
REACT_APP_DEFAULT_STREAM_KEY=test
REACT_APP_DEBUG_MODE=true
"@ | Out-File -FilePath $frontendEnvFile -Encoding utf8
    Write-Log "Created frontend .env file with development settings" "SUCCESS"
}
else {
    Write-Log "Frontend .env file already exists" "INFO"
}

# Create a simplified script to start the testing environment
$startTestEnvScript = Join-Path $WorkspaceRoot "start-test-env.ps1"
@"
# Quick script to start testing environment
param(
    [switch]`$Debug = `$false
)

`$WorkspaceRoot = `$PSScriptRoot
`$BackendPath = Join-Path `$WorkspaceRoot "backend"
`$FrontendPath = Join-Path `$WorkspaceRoot "frontend"

# Start backend server in a new window
Start-Process -FilePath "cmd.exe" -ArgumentList "/k cd /d `$BackendPath && npm run dev" -WindowStyle Normal

# Give backend time to start
Write-Host "Starting backend server..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Start frontend server in a new window
Start-Process -FilePath "cmd.exe" -ArgumentList "/k cd /d `$FrontendPath && npm start" -WindowStyle Normal

Write-Host "`nTesting environment started!" -ForegroundColor Green
Write-Host "- Backend is running at http://localhost:45001" -ForegroundColor Cyan
Write-Host "- Frontend is running at http://localhost:3000" -ForegroundColor Cyan
Write-Host "- RTMP URL for OBS: rtmp://localhost:45935/live" -ForegroundColor Cyan
Write-Host "- HTTP-FLV Stream: http://localhost:45000/live/test.flv" -ForegroundColor Cyan

if (`$Debug) {
    Write-Host "`nTo stop the environment, close the terminal windows" -ForegroundColor Yellow
    
    # Keep the main script alive to capture Ctrl+C for clean shutdown
    try {
        Write-Host "Press Ctrl+C to stop all servers..." -ForegroundColor Yellow
        while (`$true) { Start-Sleep -Seconds 1 }
    }
    finally {
        Write-Host "Stopping testing environment..." -ForegroundColor Yellow
    }
}
"@ | Out-File -FilePath $startTestEnvScript -Encoding utf8

Write-Log "Created start-test-env.ps1 script for easy startup" "SUCCESS"

# Update package.json to add test:env script
Write-Log "Updating package.json to add test scripts..." "INFO"
try {
    $packageJson = Get-Content (Join-Path $WorkspaceRoot "package.json") -Raw | ConvertFrom-Json
    
    # Add test:env script if it doesn't exist
    if (-not $packageJson.scripts.PSObject.Properties.Name.Contains("test:env")) {
        $packageJson.scripts | Add-Member -Name "test:env" -Value "powershell -ExecutionPolicy Bypass -File ./start-test-env.ps1" -MemberType NoteProperty
    }
    
    $packageJson | ConvertTo-Json -Depth 10 | Out-File -FilePath (Join-Path $WorkspaceRoot "package.json") -Encoding utf8
    Write-Log "Added test:env script to package.json" "SUCCESS"
}
catch {
    Write-Log "Failed to update package.json: $_" "ERROR"
}

Write-Log "Local testing environment setup complete!" "SUCCESS"
Write-Log "You can start the testing environment using: npm run test:env" "INFO"
Write-Log "   - Or run: powershell -ExecutionPolicy Bypass -File ./start-test-env.ps1" "INFO"