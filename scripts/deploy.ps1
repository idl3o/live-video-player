#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deployment script for Live Video Player application
.DESCRIPTION
    This script provides deployment functionality for the Live Video Player application to various hosting platforms
.PARAMETER Platform
    The platform to deploy to: heroku, vercel, or custom
.PARAMETER Environment
    The environment to deploy to: development (default) or production
.EXAMPLE
    ./deploy.ps1 heroku
    ./deploy.ps1 vercel production
    ./deploy.ps1 custom
#>

param(
    [Parameter(Position=0)]
    [ValidateSet("heroku", "vercel", "custom", "help")]
    [string]$Platform = "help",

    [Parameter(Position=1)]
    [ValidateSet("development", "production")]
    [string]$Environment = "development"
)

# Define paths
$scriptsDir = $PSScriptRoot
$rootDir = Split-Path -Parent $scriptsDir
$buildDir = Join-Path -Path $rootDir -ChildPath "build"
$deployDir = Join-Path -Path $rootDir -ChildPath "deploy"

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

function Read-UserInput {
    param(
        [string]$Prompt,
        [string]$Default = ""
    )
    
    $promptText = $Prompt
    if ($Default -ne "") {
        $promptText += " (default: $Default)"
    }
    $promptText += ": "
    
    Write-Host -NoNewline $promptText
    $input = Read-Host
    
    if ($input -eq "" -and $Default -ne "") {
        return $Default
    }
    
    return $input
}

function Show-Help {
    Write-Header "Live Video Player Deployment Script"
    Write-Host ""
    Write-Host "Usage: ./deploy.ps1 [platform] [environment]"
    Write-Host ""
    Write-Host "Platforms:"
    Write-Host "  heroku      - Deploy to Heroku"
    Write-Host "  vercel      - Deploy to Vercel"
    Write-Host "  custom      - Create a deployment package for a custom server"
    Write-Host "  help        - Show this help message"
    Write-Host ""
    Write-Host "Environments:"
    Write-Host "  development - (Default) Deploy for development environment"
    Write-Host "  production  - Deploy for production environment"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  ./deploy.ps1 heroku production"
    Write-Host "  ./deploy.ps1 custom"
    Write-Host ""
}

function Ensure-BuildExists {
    # Check if build exists, if not, run build script
    if (-not (Test-Path -Path $buildDir) -or -not (Test-Path -Path (Join-Path -Path $buildDir -ChildPath "server"))) {
        Write-WarningMessage "Build directory not found or incomplete. Running build script..."
        
        $buildScript = Join-Path -Path $scriptsDir -ChildPath "manage-app.ps1"
        & $buildScript build $Environment
        
        if ($LASTEXITCODE -ne 0) {
            Write-ErrorMessage "Build failed. Please fix the build errors and try again."
            exit 1
        }
    }
}

function Deploy-ToHeroku {
    Write-Header "Deploying to Heroku ($Environment)"
    
    # Check if Heroku CLI is installed
    try {
        $herokuVersion = Invoke-Expression "heroku --version"
    }
    catch {
        Write-ErrorMessage "Heroku CLI is not installed. Please install it first: https://devcenter.heroku.com/articles/heroku-cli"
        exit 1
    }
    
    # Ensure user is logged in to Heroku
    Write-InfoMessage "Checking Heroku login status..."
    $loginStatus = Invoke-Expression "heroku auth:whoami 2>&1" -ErrorAction SilentlyContinue
    
    if ($LASTEXITCODE -ne 0) {
        Write-WarningMessage "Not logged in to Heroku. Please log in..."
        Invoke-CommandLine -Command "heroku login" -Name "Heroku Login"
    } else {
        Write-Success "Logged in to Heroku as: $loginStatus"
    }
    
    # Get or create Heroku app
    $appName = Read-UserInput -Prompt "Enter your Heroku app name (leave empty to create a new app)"
    
    if (-not $appName) {
        Write-InfoMessage "Creating a new Heroku app..."
        $createAppResult = Invoke-Expression "heroku create" -ErrorAction SilentlyContinue
        
        if ($LASTEXITCODE -ne 0) {
            Write-ErrorMessage "Failed to create Heroku app"
            exit 1
        }
        
        # Extract app name from result
        $appName = ($createAppResult -split ' ')[2]
        $appName = $appName -replace "https://", "" -replace ".herokuapp.com", ""
        Write-Success "Created new Heroku app: $appName"
    }
    
    # Set up Git for Heroku
    Write-InfoMessage "Setting up Git for Heroku deployment..."
    
    # Check if we're in the build directory
    if (-not (Test-Path -Path (Join-Path -Path $buildDir -ChildPath ".git"))) {
        Write-InfoMessage "Initializing Git repository in build directory..."
        
        Set-Location -Path $buildDir
        git init
        git add .
        git commit -m "Initial Heroku deployment"
        
        # Add Heroku remote
        git remote add heroku "https://git.heroku.com/$appName.git"
    } else {
        Write-InfoMessage "Git repository already exists in build directory"
        
        # Ensure Heroku remote is set
        Set-Location -Path $buildDir
        git remote remove heroku 2> $null
        git remote add heroku "https://git.heroku.com/$appName.git"
    }
    
    # Set up buildpacks
    Write-InfoMessage "Setting up Heroku buildpacks..."
    Invoke-Expression "heroku buildpacks:set heroku/nodejs --app $appName" | Out-Null
    
    # Set environment variables
    Write-InfoMessage "Setting environment variables..."
    Invoke-Expression "heroku config:set NODE_ENV=$Environment --app $appName" | Out-Null
    
    # Ask for custom ports
    $customPorts = Read-UserInput -Prompt "Do you want to configure custom ports? (y/N)" -Default "n"
    
    if ($customPorts -eq "y" -or $customPorts -eq "Y") {
        $port = Read-UserInput -Prompt "Enter the port for the API server" -Default "45001"
        Invoke-Expression "heroku config:set PORT=$port --app $appName" | Out-Null
        
        $rtmpPort = Read-UserInput -Prompt "Enter the port for the RTMP server" -Default "45935"
        Invoke-Expression "heroku config:set RTMP_PORT=$rtmpPort --app $appName" | Out-Null
        
        $httpPort = Read-UserInput -Prompt "Enter the port for the HTTP-FLV server" -Default "45000"
        Invoke-Expression "heroku config:set HTTP_PORT=$httpPort --app $appName" | Out-Null
    }
    
    # Deploy to Heroku
    Write-InfoMessage "Deploying to Heroku..."
    Set-Location -Path $buildDir
    
    $deploySuccess = Invoke-CommandLine -Command "git push heroku master --force" -WorkingDirectory $buildDir -Name "Heroku Deploy"
    
    if ($deploySuccess) {
        Write-Success "Successfully deployed to Heroku: https://$appName.herokuapp.com"
        
        $openApp = Read-UserInput -Prompt "Do you want to open the app in your browser? (Y/n)" -Default "y"
        
        if ($openApp -eq "y" -or $openApp -eq "Y") {
            Start-Process "https://$appName.herokuapp.com"
        }
    } else {
        Write-ErrorMessage "Deployment to Heroku failed"
        exit 1
    }
}

function Deploy-ToVercel {
    Write-Header "Deploying to Vercel ($Environment)"
    
    # Check if Vercel CLI is installed
    try {
        $vercelVersion = Invoke-Expression "vercel --version"
    }
    catch {
        Write-WarningMessage "Vercel CLI is not installed. Installing now..."
        Invoke-CommandLine -Command "npm install -g vercel" -Name "Install Vercel CLI"
    }
    
    # Create vercel.json in build directory
    $vercelConfig = @{
        version = 2
        builds = @(
            @{
                src = "server/**/*.js"
                use = "@vercel/node"
            }
            @{
                src = "public/**"
                use = "@vercel/static"
            }
        )
        routes = @(
            @{
                handle = "filesystem"
            }
            @{
                src = "/api/(.*)"
                dest = "server/server.js"
            }
            @{
                src = "/(.*)"
                dest = "public/index.html"
            }
        )
        env = @{
            NODE_ENV = $Environment
        }
    } | ConvertTo-Json -Depth 4
    
    $vercelConfigPath = Join-Path -Path $buildDir -ChildPath "vercel.json"
    Set-Content -Path $vercelConfigPath -Value $vercelConfig
    
    Write-Success "Created vercel.json configuration file"
    
    # Deploy to Vercel
    Write-InfoMessage "Deploying to Vercel..."
    $deploySuccess = Invoke-CommandLine -Command "vercel --prod" -WorkingDirectory $buildDir -Name "Vercel Deploy"
    
    if ($deploySuccess) {
        Write-Success "Successfully deployed to Vercel"
    } else {
        Write-ErrorMessage "Deployment to Vercel failed"
        exit 1
    }
}

function Deploy-ToCustomServer {
    Write-Header "Creating deployment package for custom server ($Environment)"
    
    # Create deployment directory if it doesn't exist
    if (-not (Test-Path -Path $deployDir)) {
        New-Item -Path $deployDir -ItemType Directory | Out-Null
    }
    
    # Create zip deployment package
    $dateStr = Get-Date -Format "yyyyMMdd-HHmmss"
    $zipName = "live-video-player-$dateStr.zip"
    $zipPath = Join-Path -Path $deployDir -ChildPath $zipName
    
    Write-InfoMessage "Creating deployment package: $zipPath"
    Compress-Archive -Path "$buildDir\*" -DestinationPath $zipPath -Force
    
    Write-Success "Deployment package created: $zipPath"
    
    # Ask if user wants to deploy via SCP
    $useScp = Read-UserInput -Prompt "Do you want to deploy via SCP? (y/N)" -Default "n"
    
    if ($useScp -eq "y" -or $useScp -eq "Y") {
        $hostName = Read-UserInput -Prompt "Enter server hostname or IP"
        $user = Read-UserInput -Prompt "Enter username"
        $path = Read-UserInput -Prompt "Enter target directory on server" -Default "/var/www/live-video-player"
        
        # Create target directory if it doesn't exist
        Write-InfoMessage "Creating target directory on server..."
        Invoke-CommandLine -Command "ssh -t $user@$hostName `"mkdir -p $path`"" -Name "SSH Mkdir"
        
        # Upload zip file
        Write-InfoMessage "Uploading deployment package to server..."
        Invoke-CommandLine -Command "scp `"$zipPath`" $user@$hostName`:$path" -Name "SCP Upload"
        
        # Extract and set up on the server
        $extractOnServer = Read-UserInput -Prompt "Do you want to extract the package on the server? (Y/n)" -Default "y"
        
        if ($extractOnServer -eq "y" -or $extractOnServer -eq "Y") {
            Write-InfoMessage "Extracting package and setting up on server..."
            $sshCommand = "cd $path && unzip -o $zipName && cd $path && npm install --production"
            
            Invoke-CommandLine -Command "ssh -t $user@$hostName `"$sshCommand`"" -Name "SSH Setup"
            
            Write-Success "Deployment to custom server completed successfully"
        }
    } else {
        # Show manual deployment instructions
        Write-InfoMessage "Manual deployment instructions:"
        Write-Host "1. Copy the deployment package to your server: $zipPath"
        Write-Host "2. Extract the package on your server"
        Write-Host "3. Install dependencies: npm install --production"
        Write-Host "4. Start the server: npm start or node server/server.js"
    }
}

# Ensure the build exists before deploying
Ensure-BuildExists

# Execute the requested deployment command
switch ($Platform) {
    "heroku" {
        Deploy-ToHeroku
    }
    "vercel" {
        Deploy-ToVercel
    }
    "custom" {
        Deploy-ToCustomServer
    }
    "help" {
        Show-Help
    }
    default {
        Write-ErrorMessage "Unknown platform: $Platform"
        Show-Help
        exit 1
    }
}

exit 0