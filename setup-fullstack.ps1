#!/usr/bin/env pwsh
# PowerShell script to set up the full stack implementation for live-video-player
# Integrates the landing page with backend and frontend

# Set error action preference to stop on errors
$ErrorActionPreference = "Stop"

# Function to write colorful messages
function Write-ColorOutput {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Message,
        
        [Parameter(Mandatory=$false)]
        [string]$ForegroundColor = "White"
    )
    
    Write-Host $Message -ForegroundColor $ForegroundColor
}

# Create log file
$setupLogFile = Join-Path $PSScriptRoot "setup-fullstack.log"
"$(Get-Date) - Starting full stack setup" | Out-File -FilePath $setupLogFile

# Function to log messages
function Write-Log {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Message
    )
    
    "$(Get-Date) - $Message" | Out-File -FilePath $setupLogFile -Append
}

try {
    # Display banner
    Write-ColorOutput "`n===========================================================" "Cyan"
    Write-ColorOutput "   Live Video Player - Full Stack Integration Setup" "Cyan"
    Write-ColorOutput "===========================================================`n" "Cyan"
    
    # Determine paths
    $rootDir = $PSScriptRoot
    $backendDir = Join-Path $rootDir "backend"
    $frontendDir = Join-Path $rootDir "frontend"
    $buildDir = Join-Path $rootDir "build"
    
    # Check if we're in the right directory
    if (-not (Test-Path $backendDir) -or -not (Test-Path $frontendDir)) {
        throw "Script must be run from the root of the live-video-player project"
    }
    
    Write-Log "Verified correct directory structure"
    
    # 1. Install backend dependencies
    Write-ColorOutput "`n[1/5] Installing backend dependencies..." "Yellow"
    Push-Location $backendDir
    
    Write-Log "Installing backend dependencies..."
    npm install express-static file-type
    
    # If there's an error with fileTypeFromBuffer, install the correct module
    if ($LASTEXITCODE -ne 0) {
        Write-ColorOutput "Trying alternative file-type installation..." "Yellow"
        Write-Log "Trying alternative file-type installation..."
        npm install file-type@16.5.4
    }
    
    Write-Log "Backend dependencies installed"
    Pop-Location
    
    # 2. Build the backend TypeScript
    Write-ColorOutput "`n[2/5] Building backend TypeScript..." "Yellow"
    Push-Location $backendDir
    
    Write-Log "Building backend TypeScript..."
    npm run build
    
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to build backend TypeScript"
    }
    
    Write-Log "Backend TypeScript built successfully"
    Pop-Location
    
    # 3. Verify landing page is properly configured
    Write-ColorOutput "`n[3/5] Verifying landing page configuration..." "Yellow"
    $landingPagePath = Join-Path $rootDir "landing-page.html"
    
    if (-not (Test-Path $landingPagePath)) {
        throw "Landing page not found at: $landingPagePath"
    }
    
    # Check if paths are correctly configured
    $landingPageContent = Get-Content $landingPagePath -Raw
    
    if (-not ($landingPageContent -match '/frontend/public/logo192.png')) {
        Write-ColorOutput "Fixing image paths in landing page..." "Yellow"
        Write-Log "Updating landing page paths..."
        
        $landingPageContent = $landingPageContent -replace 'frontend/public/logo192.png', '/frontend/public/logo192.png'
        $landingPageContent = $landingPageContent -replace 'frontend/public/logo512.png', '/frontend/public/logo512.png'
        $landingPageContent = $landingPageContent -replace 'frontend/public/favicon.ico', '/frontend/public/favicon.ico'
        
        $landingPageContent | Set-Content $landingPagePath
        Write-Log "Landing page paths updated"
    }
    
    Write-Log "Landing page verified"
    
    # 4. Copy landing page to build directory for deployment consistency
    Write-ColorOutput "`n[4/5] Copying landing page to build directory..." "Yellow"
    
    if (-not (Test-Path $buildDir)) {
        Write-Log "Creating build directory..."
        New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
    }
    
    Copy-Item $landingPagePath -Destination $buildDir
    Write-Log "Landing page copied to build directory"
    
    # 5. Update package.json script
    Write-ColorOutput "`n[5/5] Updating startup scripts..." "Yellow"
    $packageJsonPath = Join-Path $rootDir "package.json"
    
    Write-Log "Updating main package.json..."
    $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
    
    # Add fullstack script if it doesn't exist
    if (-not ($packageJson.scripts.PSObject.Properties.Name -contains "fullstack")) {
        $packageJson.scripts | Add-Member -Name "fullstack" -Value "powershell -ExecutionPolicy Bypass -File ./start-fullstack.ps1" -MemberType NoteProperty
        $packageJson | ConvertTo-Json -Depth 10 | Set-Content $packageJsonPath
        Write-Log "Added fullstack script to package.json"
    }
    
    # Create start-fullstack.ps1 file
    $startFullstackPath = Join-Path $rootDir "start-fullstack.ps1"
    
    $startFullstackContent = @"
# PowerShell Script to launch the full stack application
# Starts backend server with integrated landing page and redirects to frontend app

# Add parameter to force start even if lock file exists
param(
    [switch]`$Force = `$false
)

# Create a unique identifier for this script run to avoid recursion
`$scriptRunId = [guid]::NewGuid().ToString()
`$logFile = Join-Path `$PSScriptRoot "fullstack-server.log"

# Function to write to log file
function Write-Log {
    param (
        [string]`$Message
    )
    
    `$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "`$timestamp - `$Message" | Out-File -Append -FilePath `$logFile
}

# Check if we're in a recursive call
if (Test-Path -Path "`$env:TEMP\live-video-player-fullstack.lock") {
    `$runningId = Get-Content -Path "`$env:TEMP\live-video-player-fullstack.lock"
    
    if (`$Force) {
        Write-Log "WARNING: Found existing lock file (ID: `$runningId), but -Force was specified. Removing lock file and continuing."
        Write-Host "WARNING: Found existing lock file. Forcing start with new instance." -ForegroundColor Yellow
        Remove-Item -Path "`$env:TEMP\live-video-player-fullstack.lock" -Force
    } else {
        Write-Log "ERROR: Another instance of the script appears to be running (ID: `$runningId). Exiting to prevent recursion."
        Write-Host "ERROR: Another instance is already running. Please wait for it to exit or terminate the process." -ForegroundColor Red
        Write-Host "TIP: Run the script with -Force parameter to override: powershell -ExecutionPolicy Bypass -File ./start-fullstack.ps1 -Force" -ForegroundColor Cyan
        Write-Host "Press any key to exit..."
        `$null = `$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        exit 1
    }
}

# Create lock file with our run ID
`$scriptRunId | Out-File -FilePath "`$env:TEMP\live-video-player-fullstack.lock"

Write-Log "Starting fullstack launcher with run ID: `$scriptRunId"

try {
    # Define the required ports
    `$API_PORT = 45001
    `$RTMP_PORT = 45935
    `$HTTP_PORT = 45000
    `$FRONTEND_PORT = 3000

    # Define paths
    `$WORKSPACE_ROOT = `$PSScriptRoot
    `$BACKEND_PATH = Join-Path `$WORKSPACE_ROOT "backend"
    `$FRONTEND_PATH = Join-Path `$WORKSPACE_ROOT "frontend"

    Write-Host "`n*** Live Video Player Full Stack Launcher ***`n" -ForegroundColor Cyan
    Write-Log "Initialized with ports - API: `$API_PORT, RTMP: `$RTMP_PORT, HTTP: `$HTTP_PORT, Frontend: `$FRONTEND_PORT"

    # Function to check and kill processes using specific ports
    function Clear-PortProcesses {
        param (
            [int[]]`$Ports
        )
        
        Write-Host "Checking for processes using ports: `$(`$Ports -join ', ')..." -ForegroundColor Yellow
        Write-Log "Checking for processes using ports: `$(`$Ports -join ', ')"
        
        foreach (`$port in `$Ports) {
            `$connections = netstat -ano | Select-String -Pattern ":`$port .*LISTENING"
            if (`$connections) {
                Write-Log "Found connections on port `$port"
                `$connections | ForEach-Object {
                    `$line = `$_ -replace '.*LISTENING\s+', ''
                    `$processId = `$line.Trim()
                    try {
                        `$process = Get-Process -Id `$processId -ErrorAction SilentlyContinue
                        if (`$process) {
                            Write-Host "Terminating process using port `$port - PID: `$processId, Name: `$(`$process.ProcessName)" -ForegroundColor Red
                            Write-Log "Terminating process - PID: `$processId, Name: `$(`$process.ProcessName)"
                            Stop-Process -Id `$processId -Force
                            Start-Sleep -Seconds 1
                        }
                    } catch {
                        Write-Host "Error accessing process with PID `$processId - `$_" -ForegroundColor DarkRed
                        Write-Log "Error accessing process with PID `$processId - `$_"
                    }
                }
            } else {
                Write-Host "Port `$port is clear - no processes found." -ForegroundColor Green
                Write-Log "Port `$port is clear"
            }
        }
        
        # Double-check all ports are actually cleared
        `$stillInUse = @()
        foreach (`$port in `$Ports) {
            `$connections = netstat -ano | Select-String -Pattern ":`$port .*LISTENING"
            if (`$connections) {
                `$stillInUse += `$port
            }
        }
        
        if (`$stillInUse.Count -gt 0) {
            Write-Host "WARNING: Ports still in use after clearing attempt: `$(`$stillInUse -join ', ')" -ForegroundColor Red
            Write-Log "WARNING: Ports still in use after clearing attempt: `$(`$stillInUse -join ', ')"
            Write-Host "You may need to manually close applications using these ports." -ForegroundColor Yellow
            
            `$continue = Read-Host "Continue anyway? (y/n)"
            if (`$continue -ne "y") {
                throw "Aborting due to ports still in use"
            }
        }
        
        Write-Host "Port clearing completed.`n" -ForegroundColor Green
        Write-Log "Port clearing completed"
    }

    # Clear ports first
    Clear-PortProcesses -Ports @(`$API_PORT, `$RTMP_PORT, `$HTTP_PORT, `$FRONTEND_PORT)
    
    # Build TypeScript files before starting the server
    Write-Host "`n[BUILDING] Compiling TypeScript for backend..." -ForegroundColor Cyan
    Write-Log "Compiling TypeScript files"
    
    # Move to backend directory and build first
    Push-Location `$BACKEND_PATH
    `$buildProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run build" -PassThru -Wait -NoNewWindow
    
    if (`$buildProcess.ExitCode -ne 0) {
        Write-Host "Error compiling TypeScript files. Check for errors." -ForegroundColor Red
        Write-Log "Failed to compile TypeScript files"
        Pop-Location
        throw "TypeScript compilation failed"
    } else {
        Write-Host "[SUCCESS] TypeScript compiled successfully" -ForegroundColor Green
        Write-Log "TypeScript files compiled successfully"
    }
    Pop-Location
    
    # Start backend server first
    Write-Host "`n[STARTING] Launching Backend Server with Landing Page (RTMP: `$RTMP_PORT, HTTP: `$HTTP_PORT, API: `$API_PORT)" -ForegroundColor DarkCyan
    Write-Log "Launching Backend Server"
    
    `$backendLogFile = Join-Path `$WORKSPACE_ROOT "backend_output.log"
    
    # Move to backend directory and start the server
    Push-Location `$BACKEND_PATH
    
    # Start backend server
    `$backendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm start > `"`$backendLogFile`" 2>&1" -PassThru -WindowStyle Normal
    `$backendPid = `$backendProcess.Id
    Write-Log "Started backend process with PID: `$backendPid"
    
    # Give the server time to start
    Write-Host "[WAITING] Waiting for backend to initialize (15 seconds)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 15
    
    # Check if ports are actually listening now
    `$apiListening = `$false
    try {
        `$netstatOutput = netstat -ano | Select-String -Pattern ":`$API_PORT .*LISTENING"
        `$apiListening = `$netstatOutput -ne `$null
        Write-Log "API port listening check: `$apiListening"
    } catch {
        Write-Host "Error checking API port status: `$_" -ForegroundColor DarkRed
        Write-Log "Error checking API port status: `$_"
    }
    
    if (-not `$apiListening) {
        Write-Host "[WARNING] API server does not appear to be listening on port `$API_PORT!" -ForegroundColor Red
        Write-Host "Checking backend logs for errors..." -ForegroundColor Yellow
        Get-Content -Path `$backendLogFile -Tail 20
        
        `$continue = Read-Host "Backend might not have started correctly. Continue anyway? (y/n)"
        if (`$continue -ne "y") {
            throw "Backend server failed to start properly"
        }
    } else {
        Write-Host "[SUCCESS] API server verified listening on port `$API_PORT" -ForegroundColor Green
        Write-Log "API server verified listening on port `$API_PORT"
    }
    
    # Return to the original location
    Pop-Location
    
    # Start frontend server
    Write-Host "`n[STARTING] Launching Frontend Server" -ForegroundColor DarkMagenta
    Write-Log "Launching Frontend Server"
    
    `$frontendLogFile = Join-Path `$WORKSPACE_ROOT "frontend_output.log"
    
    # Move to frontend directory and start the server
    Push-Location `$FRONTEND_PATH
    
    # Start frontend server 
    `$frontendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm start > `"`$frontendLogFile`" 2>&1" -PassThru -WindowStyle Minimized
    `$frontendPid = `$frontendProcess.Id
    Write-Log "Started frontend process with PID: `$frontendPid"
    
    # Return to the original location
    Pop-Location
    
    # Open default browser to the landing page
    Start-Sleep -Seconds 3
    Write-Host "`n[LAUNCHING] Opening landing page in default browser..." -ForegroundColor Cyan
    Start-Process "http://localhost:`$API_PORT"
    
    # Show connection information once both are running
    Write-Host "`n[INFO] Connection Information:" -ForegroundColor White
    Write-Host "  Landing Page URL: http://localhost:`$API_PORT" -ForegroundColor White
    Write-Host "  Frontend App URL: http://localhost:`$FRONTEND_PORT" -ForegroundColor White
    Write-Host "  RTMP URL (OBS): rtmp://localhost:`$RTMP_PORT/live/YOUR_STREAM_KEY" -ForegroundColor White
    Write-Host "  HTTP-FLV URL: http://localhost:`$HTTP_PORT/live/YOUR_STREAM_KEY.flv" -ForegroundColor White
    Write-Host "  API URL: http://localhost:`$API_PORT/api/streams" -ForegroundColor White
    
    # OBS Configuration Help
    Write-Host "`n[HELP] OBS Configuration Guide:" -ForegroundColor Cyan
    Write-Host "  1. In OBS, go to Settings > Stream" -ForegroundColor White
    Write-Host "  2. Set Service to 'Custom'" -ForegroundColor White
    Write-Host "  3. Set Server to: rtmp://localhost:`$RTMP_PORT/live" -ForegroundColor Green
    Write-Host "  4. Set Stream Key to any value (e.g. 'test')" -ForegroundColor Green
    Write-Host "  5. Click OK and then click 'Start Streaming'" -ForegroundColor White
    
    # Wait for user input to stop the servers
    try {
        Write-Host "`n[INFO] Press Ctrl+C to stop all servers`n" -ForegroundColor Yellow
        Write-Log "All services started, waiting for user input to stop"
        
        while (`$true) {
            Start-Sleep -Seconds 1
            # Check if the processes are still running
            `$backendRunning = Get-Process -Id `$backendPid -ErrorAction SilentlyContinue
            `$frontendRunning = Get-Process -Id `$frontendPid -ErrorAction SilentlyContinue
            
            if (-not `$backendRunning -and -not `$frontendRunning) {
                Write-Host "`n[WARNING] Both server processes have stopped!" -ForegroundColor Yellow
                Write-Log "Both server processes have stopped"
                break
            } elseif (-not `$backendRunning) {
                Write-Host "`n[WARNING] Backend server has stopped!" -ForegroundColor Yellow
                Write-Log "Backend server has stopped"
                break
            } elseif (-not `$frontendRunning) {
                Write-Host "`n[WARNING] Frontend server has stopped!" -ForegroundColor Yellow
                Write-Log "Frontend server has stopped"
                break
            }
        }
    } catch {
        Write-Host "`n[ERROR] Error while monitoring processes: `$_" -ForegroundColor Red
        Write-Log "Error while monitoring processes: `$_"
    } finally {
        # This will be executed when the user presses Ctrl+C
        Write-Host "`n[STOPPING] Stopping servers..." -ForegroundColor Yellow
        Write-Log "Stopping servers"
        
        # Stop backend and frontend processes
        if (`$backendProcess -and -not `$backendProcess.HasExited) {
            try {
                Stop-Process -Id `$backendPid -Force -ErrorAction SilentlyContinue
                Write-Host "Stopped backend process (PID: `$backendPid)" -ForegroundColor Green
                Write-Log "Stopped backend process (PID: `$backendPid)"
            } catch {
                Write-Host "Error stopping backend process: `$_" -ForegroundColor Red
                Write-Log "Error stopping backend process: `$_"
            }
        }
        
        if (`$frontendProcess -and -not `$frontendProcess.HasExited) {
            try {
                Stop-Process -Id `$frontendPid -Force -ErrorAction SilentlyContinue
                Write-Host "Stopped frontend process (PID: `$frontendPid)" -ForegroundColor Green
                Write-Log "Stopped frontend process (PID: `$frontendPid)"
            } catch {
                Write-Host "Error stopping frontend process: `$_" -ForegroundColor Red
                Write-Log "Error stopping frontend process: `$_"
            }
        }
        
        # Final port cleanup to make sure everything is closed
        Clear-PortProcesses -Ports @(`$API_PORT, `$RTMP_PORT, `$HTTP_PORT, `$FRONTEND_PORT)
    }
    
    Write-Host "`n[DONE] All servers stopped." -ForegroundColor DarkGray
    Write-Log "All servers stopped"
} 
catch {
    Write-Host "`n[ERROR] Error: `$_`n" -ForegroundColor Red
    Write-Log "Fatal error: `$_"
} 
finally {
    # Clean up lock file
    if (Test-Path -Path "`$env:TEMP\live-video-player-fullstack.lock") {
        Remove-Item -Path "`$env:TEMP\live-video-player-fullstack.lock" -Force
        Write-Log "Removed lock file"
    }
    
    Write-Log "Script execution completed"
}
"@
    
    $startFullstackContent | Set-Content $startFullstackPath
    Write-Log "Created start-fullstack.ps1"
    
    # Make the script executable
    if ($IsWindows -or $PSVersionTable.PSEdition -eq "Desktop") {
        # On Windows, ensure the script has the right execution policy
        Set-ItemProperty -Path $startFullstackPath -Name IsReadOnly -Value $false
    } else {
        # On Linux/Mac, make the script executable
        chmod +x $startFullstackPath
    }
    
    Write-ColorOutput "`nSetup completed successfully!" "Green"
    Write-ColorOutput "`nTo start the full stack application, run:" "Yellow"
    Write-ColorOutput "npm run fullstack" "Cyan"
    Write-ColorOutput "`nThis will start:" "White"
    Write-ColorOutput "1. The backend server with the landing page at http://localhost:45001" "White"
    Write-ColorOutput "2. The React frontend app at http://localhost:3000" "White"
    Write-ColorOutput "3. The landing page will redirect to the React app when you click the launch buttons" "White"
    
    Write-Log "Setup completed successfully"
    
} catch {
    Write-ColorOutput "`nERROR: $_`n" "Red"
    Write-Log "ERROR: $_"
    exit 1
}
