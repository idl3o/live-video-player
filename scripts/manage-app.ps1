#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Management script for Live Video Player application
.DESCRIPTION
    This script provides commands to build, test, and deploy the Live Video Player application
.PARAMETER Command
    The command to execute: build, test, deploy, start, or help
.PARAMETER Environment
    The environment to use: development (default) or production
.EXAMPLE
    ./manage-app.ps1 build
    ./manage-app.ps1 test
    ./manage-app.ps1 deploy
    ./manage-app.ps1 start
    ./manage-app.ps1 help
#>

param(
    [Parameter(Position=0)]
    [ValidateSet("build", "test", "deploy", "start", "help")]
    [string]$Command = "help",

    [Parameter(Position=1)]
    [ValidateSet("development", "production")]
    [string]$Environment = "development"
)

# Define paths
$scriptsDir = $PSScriptRoot
$rootDir = Split-Path -Parent $scriptsDir
$frontendDir = Join-Path -Path $rootDir -ChildPath "frontend"
$backendDir = Join-Path -Path $rootDir -ChildPath "backend"
$buildDir = Join-Path -Path $rootDir -ChildPath "build"

# Check PowerShell version for color support
$supportsVirtualTerminal = $PSVersionTable.PSVersion.Major -ge 5

# Define color function that works with older PowerShell
function Write-ColorText {
    param(
        [string]$Text,
        [string]$ForegroundColor = "White"
    )
    
    if ($supportsVirtualTerminal) {
        Write-Host $Text -ForegroundColor $ForegroundColor
    } else {
        Write-Host $Text
    }
}

# Define custom write functions using standard PowerShell colors
function Write-Header {
    param([string]$Text)
    Write-Host "`n==== $Text ====" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Text)
    Write-Host "✓ $Text" -ForegroundColor Green
}

function Write-ErrorMessage {
    param([string]$Text)
    Write-Host "✗ $Text" -ForegroundColor Red
}

function Write-WarningMessage {
    param([string]$Text)
    Write-Host "⚠ $Text" -ForegroundColor Yellow
}

function Write-InfoMessage {
    param([string]$Text)
    Write-Host "ℹ $Text" -ForegroundColor Blue
}

function Invoke-CommandLine {
    param(
        [string]$Command,
        [string]$WorkingDirectory = $rootDir,
        [string]$Name = "Command"
    )

    Write-Host "[$Name] Running: $Command" -ForegroundColor Yellow
    
    $previousLocation = Get-Location
    Set-Location -Path $WorkingDirectory
    
    try {
        Invoke-Expression -Command $Command
        $exitCode = $LASTEXITCODE
        
        if ($exitCode -eq 0) {
            Write-Success "[$Name] Completed successfully"
            return $true
        } else {
            Write-ErrorMessage "[$Name] Failed with code ${exitCode}"
            return $false
        }
    }
    catch {
        Write-ErrorMessage "[$Name] Error: $_"
        return $false
    }
    finally {
        Set-Location -Path $previousLocation
    }
}

# Command functions
function Show-Help {
    Write-Header "Live Video Player Management Script"
    Write-Host ""
    Write-Host "Usage: ./manage-app.ps1 [command] [environment]"
    Write-Host ""
    Write-Host "Commands:"
    Write-Host "  build       - Build the application for development or production"
    Write-Host "  test        - Run tests for the application"
    Write-Host "  deploy      - Deploy the application"
    Write-Host "  start       - Start the application locally"
    Write-Host "  help        - Show this help message"
    Write-Host ""
    Write-Host "Environments:"
    Write-Host "  development - (Default) Build for development"
    Write-Host "  production  - Build for production"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  ./manage-app.ps1 build production"
    Write-Host "  ./manage-app.ps1 test"
    Write-Host "  ./manage-app.ps1 start"
    Write-Host ""
}

function Build-App {
    Write-Header "Building Live Video Player ($Environment)"
    
    # Create build directory if it doesn't exist
    if (-not (Test-Path -Path $buildDir)) {
        New-Item -Path $buildDir -ItemType Directory | Out-Null
    }
    
    # Build frontend
    Write-InfoMessage "Building frontend..."
    if (-not (Test-Path -Path (Join-Path -Path $frontendDir -ChildPath "node_modules"))) {
        Write-WarningMessage "Frontend node_modules not found, installing dependencies..."
        Invoke-CommandLine -Command "npm install" -WorkingDirectory $frontendDir -Name "Frontend Dependencies"
    }
    
    $frontendBuildCommand = "npm run build"
    if ($Environment -eq "production") {
        $frontendBuildCommand = "npm run build -- --production"
    }
    
    $frontendSuccess = Invoke-CommandLine -Command $frontendBuildCommand -WorkingDirectory $frontendDir -Name "Frontend Build"
    
    # Build backend
    Write-InfoMessage "Building backend..."
    if (-not (Test-Path -Path (Join-Path -Path $backendDir -ChildPath "node_modules"))) {
        Write-WarningMessage "Backend node_modules not found, installing dependencies..."
        Invoke-CommandLine -Command "npm install" -WorkingDirectory $backendDir -Name "Backend Dependencies"
    }
    
    $backendSuccess = Invoke-CommandLine -Command "npm run build" -WorkingDirectory $backendDir -Name "Backend Build"
    
    # Copy build files to build directory
    if ($frontendSuccess -and $backendSuccess) {
        Write-InfoMessage "Copying build files to build directory..."
        
        # Copy frontend build
        $frontendBuildDir = Join-Path -Path $frontendDir -ChildPath "build"
        $frontendTargetDir = Join-Path -Path $buildDir -ChildPath "public"
        
        if (-not (Test-Path -Path $frontendTargetDir)) {
            New-Item -Path $frontendTargetDir -ItemType Directory | Out-Null
        }
        
        Write-Host "[Frontend] Copying build files to $frontendTargetDir" -ForegroundColor Yellow
        
        # Copy files, handling directory not found errors
        if (Test-Path -Path $frontendBuildDir) {
            Copy-Item -Path "$frontendBuildDir\*" -Destination $frontendTargetDir -Recurse -Force
        } else {
            Write-ErrorMessage "Frontend build directory not found at: $frontendBuildDir"
        }
        
        # Copy backend build
        $backendBuildDir = Join-Path -Path $backendDir -ChildPath "dist"
        $backendTargetDir = Join-Path -Path $buildDir -ChildPath "server"
        
        if (-not (Test-Path -Path $backendTargetDir)) {
            New-Item -Path $backendTargetDir -ItemType Directory | Out-Null
        }
        
        Write-Host "[Backend] Copying build files to $backendTargetDir" -ForegroundColor Yellow
        
        # Copy files, handling directory not found errors
        if (Test-Path -Path $backendBuildDir) {
            Copy-Item -Path "$backendBuildDir\*" -Destination $backendTargetDir -Recurse -Force
        } else {
            Write-ErrorMessage "Backend build directory not found at: $backendBuildDir"
        }
        
        # Copy package.json for dependencies if it exists
        $backendPackageJson = Join-Path -Path $backendDir -ChildPath "package.json"
        if (Test-Path -Path $backendPackageJson) {
            Copy-Item -Path $backendPackageJson -Destination $backendTargetDir
            Write-InfoMessage "Copied backend package.json"
        }
        
        # Create production package.json
        $productionPackage = @{
            name = "live-video-player"
            version = "1.0.0"
            description = "Live Video Player - Production Build"
            main = "server/server.js"
            scripts = @{
                start = "node server/server.js"
            }
            dependencies = @{}
            engines = @{
                node = ">=14.0.0"
            }
        }
        
        $productionPackagePath = Join-Path -Path $buildDir -ChildPath "package.json"
        $productionPackage | ConvertTo-Json | Set-Content -Path $productionPackagePath
        
        # Create README.md
        $readmeContent = @"
# Live Video Player - Production Build

This is the production build of the Live Video Player application.

## Setup

1. Run `npm install` in this directory to install dependencies
2. Configure environment variables if needed
3. Run `npm start` to start the server

The application will be available at http://localhost:45001 by default.

## Configuration

You can configure the following environment variables:

- `PORT`: The port for the API server (default: 45001)
- `RTMP_PORT`: The port for the RTMP server (default: 45935)
- `HTTP_PORT`: The port for the HTTP-FLV server (default: 45000)

"@
        
        $readmePath = Join-Path -Path $buildDir -ChildPath "README.md"
        $readmeContent | Set-Content -Path $readmePath
        
        # Create start.cmd
        $cmdContent = @"
@echo off
echo Starting Live Video Player...
node server/server.js
"@
        
        $cmdPath = Join-Path -Path $buildDir -ChildPath "start.cmd"
        $cmdContent | Set-Content -Path $cmdPath
        
        Write-Success "Build completed successfully"
    } else {
        Write-ErrorMessage "Build failed"
        exit 1
    }
}

function Test-App {
    Write-Header "Testing Live Video Player"
    
    # Run frontend tests
    Write-InfoMessage "Running frontend tests..."
    if (-not (Test-Path -Path (Join-Path -Path $frontendDir -ChildPath "node_modules"))) {
        Write-WarningMessage "Frontend node_modules not found, installing dependencies..."
        Invoke-CommandLine -Command "npm install" -WorkingDirectory $frontendDir -Name "Frontend Dependencies"
    }
    
    $frontendTestSuccess = Invoke-CommandLine -Command "npm test -- --watchAll=false" -WorkingDirectory $frontendDir -Name "Frontend Tests"
    
    # Run backend tests
    Write-InfoMessage "Running backend tests..."
    if (-not (Test-Path -Path (Join-Path -Path $backendDir -ChildPath "node_modules"))) {
        Write-WarningMessage "Backend node_modules not found, installing dependencies..."
        Invoke-CommandLine -Command "npm install" -WorkingDirectory $backendDir -Name "Backend Dependencies"
    }
    
    $backendTestSuccess = Invoke-CommandLine -Command "npm test" -WorkingDirectory $backendDir -Name "Backend Tests"
    
    if ($frontendTestSuccess -and $backendTestSuccess) {
        Write-Success "All tests passed"
    } else {
        Write-ErrorMessage "Some tests failed"
        exit 1
    }
}

function Deploy-App {
    Write-Header "Deploying Live Video Player"
    
    # Check if Node.js is installed
    try {
        node --version | Out-Null
    }
    catch {
        Write-ErrorMessage "Node.js is not installed. Please install Node.js and try again."
        exit 1
    }
    
    # Run the Node.js deploy script
    $deployScript = Join-Path -Path $scriptsDir -ChildPath "deploy.js"
    if (Test-Path -Path $deployScript) {
        Invoke-CommandLine -Command "node `"$deployScript`"" -Name "Deploy"
    } else {
        Write-ErrorMessage "Deploy script not found at: $deployScript"
        exit 1
    }
}

function Start-LiveApp {
    Write-Header "Starting Live Video Player locally"
    
    # Check if the start-servers script exists
    $startScript = Join-Path -Path $rootDir -ChildPath "start-servers.ps1"
    if (Test-Path -Path $startScript) {
        Write-InfoMessage "Starting using start-servers.ps1..."
        & $startScript
    } else {
        # Start frontend and backend separately
        Write-InfoMessage "Starting frontend and backend servers..."
        
        # Start backend
        $backendProcess = Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", "cd `"$backendDir`"; npm start" -PassThru
        
        # Start frontend
        $frontendProcess = Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", "cd `"$frontendDir`"; npm start" -PassThru
        
        Write-Success "Servers started successfully"
        Write-InfoMessage "Press Ctrl+C to stop the servers"
        
        try {
            # Keep script running until manually stopped
            while ($true) {
                Start-Sleep -Seconds 1
                
                # Check if processes are still running
                if ($backendProcess.HasExited) {
                    Write-ErrorMessage "Backend server has exited"
                    break
                }
                
                if ($frontendProcess.HasExited) {
                    Write-ErrorMessage "Frontend server has exited"
                    break
                }
            }
        }
        finally {
            # Clean up processes when script is interrupted
            if (-not $backendProcess.HasExited) {
                $backendProcess.Kill()
            }
            
            if (-not $frontendProcess.HasExited) {
                $frontendProcess.Kill()
            }
        }
    }
}

# Execute the requested command
switch ($Command) {
    "build" {
        Build-App
    }
    "test" {
        Test-App
    }
    "deploy" {
        Deploy-App
    }
    "start" {
        Start-LiveApp
    }
    "help" {
        Show-Help
    }
    default {
        Write-ErrorMessage "Unknown command: $Command"
        Show-Help
        exit 1
    }
}

exit 0