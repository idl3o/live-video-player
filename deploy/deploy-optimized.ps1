# Optimized deployment script for Live Video Player
# Includes proper handling of ffmpeg and other dependencies

param (
    [string]$TargetEnvironment = "production",
    [string]$BuildVersion = (Get-Date -Format "yyyyMMdd-HHmmss"),
    [switch]$SkipTests = $false,
    [switch]$Force = $false
)

$ErrorActionPreference = "Stop"
$WorkspaceRoot = Split-Path -Parent $PSScriptRoot
$BackendPath = Join-Path $WorkspaceRoot "backend"
$FrontendPath = Join-Path $WorkspaceRoot "frontend"
$BuildPath = Join-Path $WorkspaceRoot "build"
$DeploymentPackagePath = Join-Path $PSScriptRoot "live-video-player-$BuildVersion.zip"

function Write-Status {
    param([string]$Message, [string]$Level = "INFO")
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    
    switch ($Level) {
        "ERROR" { Write-Host "[$timestamp] [ERROR] $Message" -ForegroundColor Red }
        "WARNING" { Write-Host "[$timestamp] [WARNING] $Message" -ForegroundColor Yellow }
        "SUCCESS" { Write-Host "[$timestamp] [SUCCESS] $Message" -ForegroundColor Green }
        default { Write-Host "[$timestamp] [INFO] $Message" -ForegroundColor Cyan }
    }
}

# Display deployment info
Write-Status "Starting optimized deployment process for Live Video Player"
Write-Status "Target Environment: $TargetEnvironment"
Write-Status "Build Version: $BuildVersion"

# Create a clean build directory
if (Test-Path $BuildPath) {
    if ($Force) {
        Write-Status "Removing existing build directory" "WARNING"
        Remove-Item -Path $BuildPath -Recurse -Force
    } else {
        Write-Status "Build directory already exists. Use -Force to overwrite." "ERROR"
        exit 1
    }
}

# Create the build structure
New-Item -Path $BuildPath -ItemType Directory -Force | Out-Null
New-Item -Path (Join-Path $BuildPath "server") -ItemType Directory -Force | Out-Null
New-Item -Path (Join-Path $BuildPath "public") -ItemType Directory -Force | Out-Null

# Build Backend
Write-Status "Building backend..."
Push-Location $BackendPath
try {
    # Install dependencies if needed
    if (-not (Test-Path "node_modules")) {
        Write-Status "Installing backend dependencies..."
        npm install --production
    }
    
    # Build TypeScript
    Write-Status "Compiling TypeScript..."
    npm run build
    
    # Check if ffmpeg is installed as a dependency
    $ffmpegStaticPath = Join-Path $BackendPath "node_modules\ffmpeg-static"
    $hasFfmpegStatic = Test-Path $ffmpegStaticPath
    
    if (-not $hasFfmpegStatic) {
        Write-Status "Installing ffmpeg-static package for video processing..." "WARNING"
        npm install ffmpeg-static --save
    }
    
    # Copy built files and dependencies to build folder
    Write-Status "Copying backend files to build folder..."
    Copy-Item -Path (Join-Path $BackendPath "package.json") -Destination (Join-Path $BuildPath "server") -Force
    Copy-Item -Path (Join-Path $BackendPath "package-lock.json") -Destination (Join-Path $BuildPath "server") -Force
    Copy-Item -Path (Join-Path $BackendPath "dist") -Destination (Join-Path $BuildPath "server") -Recurse -Force
    
    # Create a simplified server.js entry point for the deployed version
    @"
// Startup script for the deployed server
process.env.NODE_ENV = 'production';
require('./dist/server.js');
"@ | Out-File -FilePath (Join-Path $BuildPath "server" "server.js") -Encoding utf8
    
    # Create media directory structure for recordings and streams
    New-Item -Path (Join-Path $BuildPath "server" "media" "recordings") -ItemType Directory -Force | Out-Null
    
    # Create environment configuration for the target environment
    $envConfig = @"
# Environment configuration for $TargetEnvironment deployment
PORT=45001
RTMP_PORT=45935
HTTP_PORT=45000
JWT_SECRET=replace_this_with_a_secure_random_string_in_production
CORS_ORIGIN=*
"@
    
    $envConfig | Out-File -FilePath (Join-Path $BuildPath "server" ".env") -Encoding utf8
    
    Write-Status "Backend build completed" "SUCCESS"
} catch {
    Write-Status "Backend build failed: $_" "ERROR"
    exit 1
} finally {
    Pop-Location
}

# Build Frontend
Write-Status "Building frontend..."
Push-Location $FrontendPath
try {
    # Install dependencies if needed
    if (-not (Test-Path "node_modules")) {
        Write-Status "Installing frontend dependencies..."
        npm install
    }
    
    # Create production environment configuration
    $reactAppEnv = @"
REACT_APP_API_URL=/api
REACT_APP_WEBSOCKET_URL=ws://${TargetEnvironment}:45001
REACT_APP_HTTP_STREAM_URL=http://${TargetEnvironment}:45000
REACT_APP_RTMP_URL=rtmp://${TargetEnvironment}:45935/live
"@
    
    $reactAppEnv | Out-File -FilePath (Join-Path $FrontendPath ".env.production") -Encoding utf8
    
    # Build React app
    Write-Status "Building optimized React production build..."
    npm run build
    
    # Copy built files to the build folder
    Write-Status "Copying frontend files to build folder..."
    Copy-Item -Path (Join-Path $FrontendPath "build" "*") -Destination (Join-Path $BuildPath "public") -Recurse -Force
    
    Write-Status "Frontend build completed" "SUCCESS"
} catch {
    Write-Status "Frontend build failed: $_" "ERROR"
    exit 1
} finally {
    Pop-Location
}

# Install production dependencies in the server directory
Write-Status "Installing production dependencies for deployment..."
Push-Location (Join-Path $BuildPath "server")
try {
    npm install --production
    Write-Status "Production dependencies installed" "SUCCESS"
} catch {
    Write-Status "Failed to install production dependencies: $_" "ERROR"
    exit 1
} finally {
    Pop-Location
}

# Create package.json in the build root
$packageJson = @{
    name = "live-video-player"
    version = "1.0.0"
    description = "Live Video Player and Streaming Server"
    main = "server/server.js"
    scripts = @{
        start = "node server/server.js"
    }
    engines = @{
        node = ">=14.0.0"
    }
    dependencies = @{
        "ffmpeg-static" = "^4.4.1"
    }
}

$packageJson | ConvertTo-Json -Depth 4 | Out-File -FilePath (Join-Path $BuildPath "package.json") -Encoding utf8

# Create a simple start script for the server
@"
@echo off
echo Starting Live Video Player...
node server/server.js
"@ | Out-File -FilePath (Join-Path $BuildPath "start.cmd") -Encoding utf8

# Create README with deployment instructions
@"
# Live Video Player - Deployment Package

## Version: $BuildVersion
## Environment: $TargetEnvironment
## Build Date: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

## Deployment Instructions

1. Extract this package to your server
2. Configure the .env file in the server directory
3. Run 'npm install' in the root directory
4. Start the server with 'npm start' or 'start.cmd'

## Port Configuration

- Web/API Server: Port 45001
- HTTP-FLV Stream: Port 45000
- RTMP Stream: Port 45935

## Important Notes

- Make sure all ports are open in your firewall
- Set a proper JWT_SECRET in the .env file
- Configure CORS_ORIGIN for production use
"@ | Out-File -FilePath (Join-Path $BuildPath "README.md") -Encoding utf8

# Create the deployment package
Write-Status "Creating deployment package..."
try {
    Compress-Archive -Path "$BuildPath\*" -DestinationPath $DeploymentPackagePath -Force
    Write-Status "Deployment package created: $DeploymentPackagePath" "SUCCESS"
} catch {
    Write-Status "Failed to create deployment package: $_" "ERROR"
    exit 1
}

Write-Status "Deployment build process completed successfully!" "SUCCESS"
Write-Status "You can now deploy the package: $DeploymentPackagePath" "SUCCESS"