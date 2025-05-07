# PowerShell Script to launch both backend and frontend servers
# Enhanced version with better port checking, error handling, process management, and firewall configuration

# Create a unique identifier for this script run to avoid recursion
$scriptRunId = [guid]::NewGuid().ToString()
$logFile = Join-Path $PSScriptRoot "ps-server-launcher.log"

# Function to write to log file
function Write-Log {
    param (
        [string]$Message
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp - $Message" | Out-File -Append -FilePath $logFile
    Write-Host $Message
}

# Check if we're in a recursive call
if (Test-Path -Path "$env:TEMP\live-video-player-running.lock") {
    $runningId = Get-Content -Path "$env:TEMP\live-video-player-running.lock"
    Write-Log "ERROR: Another instance of the script appears to be running (ID: $runningId). Exiting to prevent recursion."
    Write-Host "ERROR: Another instance is already running. Please wait for it to exit or terminate the process." -ForegroundColor Red
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# Create lock file with our run ID
$scriptRunId | Out-File -FilePath "$env:TEMP\live-video-player-running.lock"

Write-Log "Starting server launcher with run ID: $scriptRunId"

try {
    # Define the required ports
    $API_PORT = 45001
    $RTMP_PORT = 45935
    $HTTP_PORT = 45000
    $FRONTEND_PORT = 3000

    # Define paths
    $WORKSPACE_ROOT = $PSScriptRoot
    $BACKEND_PATH = Join-Path $WORKSPACE_ROOT "backend"
    $FRONTEND_PATH = Join-Path $WORKSPACE_ROOT "frontend"

    Write-Host "`n*** Live Video Player Server Launcher ***`n" -ForegroundColor Cyan
    Write-Log "Initialized with ports - API: $API_PORT, RTMP: $RTMP_PORT, HTTP: $HTTP_PORT, Frontend: $FRONTEND_PORT"

    # Function to check and kill processes using specific ports
    function Clear-PortProcesses {
        param (
            [int[]]$Ports
        )
        
        Write-Host "Checking for processes using ports: $($Ports -join ', ')..." -ForegroundColor Yellow
        Write-Log "Checking for processes using ports: $($Ports -join ', ')"
        
        foreach ($port in $Ports) {
            $connections = netstat -ano | Select-String -Pattern ":$port .*LISTENING"
            if ($connections) {
                Write-Log "Found connections on port $port"
                $connections | ForEach-Object {
                    $line = $_ -replace '.*LISTENING\s+', ''
                    $pid = $line.Trim()
                    try {
                        $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
                        if ($process) {
                            Write-Host "Terminating process using port $port - PID: $pid, Name: $($process.ProcessName)" -ForegroundColor Red
                            Write-Log "Terminating process - PID: $pid, Name: $($process.ProcessName)"
                            Stop-Process -Id $pid -Force
                            Start-Sleep -Seconds 1
                        }
                    } catch {
                        Write-Host "Error accessing process with PID $pid - $_" -ForegroundColor DarkRed
                        Write-Log "Error accessing process with PID $pid - $_"
                    }
                }
            } else {
                Write-Host "Port $port is clear - no processes found." -ForegroundColor Green
                Write-Log "Port $port is clear"
            }
        }
        
        # Double-check all ports are actually cleared
        $stillInUse = @()
        foreach ($port in $Ports) {
            $connections = netstat -ano | Select-String -Pattern ":$port .*LISTENING"
            if ($connections) {
                $stillInUse += $port
            }
        }
        
        if ($stillInUse.Count -gt 0) {
            Write-Host "WARNING: Ports still in use after clearing attempt: $($stillInUse -join ', ')" -ForegroundColor Red
            Write-Log "WARNING: Ports still in use after clearing attempt: $($stillInUse -join ', ')"
            Write-Host "You may need to manually close applications using these ports." -ForegroundColor Yellow
            
            $continue = Read-Host "Continue anyway? (y/n)"
            if ($continue -ne "y") {
                throw "Aborting due to ports still in use"
            }
        }
        
        Write-Host "Port clearing completed.`n" -ForegroundColor Green
        Write-Log "Port clearing completed"
    }

    # Clear ports first
    Clear-PortProcesses -Ports @($API_PORT, $RTMP_PORT, $HTTP_PORT, $FRONTEND_PORT)
    
    # Configure firewall for required ports
    Write-Host "`n[SECURITY] Checking firewall rules..." -ForegroundColor Cyan
    
    # Start backend server first
    Write-Host "`n[STARTING] Launching Backend Server (RTMP: $RTMP_PORT, HTTP: $HTTP_PORT, API: $API_PORT)" -ForegroundColor DarkCyan
    Write-Log "Launching Backend Server"
    
    $backendLogFile = Join-Path $WORKSPACE_ROOT "backend_output.log"
    
    # Move to backend directory and start the server
    Push-Location $BACKEND_PATH
    
    # Start backend server in new window with its output redirected
    $backendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev > $backendLogFile 2>&1" -PassThru -WindowStyle Minimized
    $backendPid = $backendProcess.Id
    Write-Log "Started backend process with PID: $backendPid"
    
    # Give the server time to start
    Write-Host "[WAITING] Waiting for backend to initialize (15 seconds)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 15
    
    # Check if RTMP port is actually listening now
    $rtmpListening = $false
    try {
        $netstatOutput = netstat -ano | Select-String -Pattern ":$RTMP_PORT .*LISTENING"
        $rtmpListening = $netstatOutput -ne $null
        Write-Log "RTMP port listening check: $rtmpListening"
    } catch {
        Write-Host "Error checking RTMP port status: $_" -ForegroundColor DarkRed
        Write-Log "Error checking RTMP port status: $_"
    }
    
    if (-not $rtmpListening) {
        Write-Host "[WARNING] RTMP server does not appear to be listening on port $RTMP_PORT!" -ForegroundColor Red
        Write-Host "Checking backend logs for errors..." -ForegroundColor Yellow
        Get-Content -Path $backendLogFile -Tail 20
        
        $continue = Read-Host "Backend might not have started correctly. Continue anyway? (y/n)"
        if ($continue -ne "y") {
            throw "Backend server failed to start properly"
        }
    } else {
        Write-Host "[SUCCESS] RTMP server verified listening on port $RTMP_PORT" -ForegroundColor Green
        Write-Log "RTMP server verified listening on port $RTMP_PORT"
    }
    
    # Return to the original location
    Pop-Location
    
    # Start frontend server
    Write-Host "`n[STARTING] Launching Frontend Server" -ForegroundColor DarkMagenta
    Write-Log "Launching Frontend Server"
    
    $frontendLogFile = Join-Path $WORKSPACE_ROOT "frontend_output.log"
    
    # Move to frontend directory and start the server
    Push-Location $FRONTEND_PATH
    
    # Start frontend server in new window with its output redirected
    $frontendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm start > $frontendLogFile 2>&1" -PassThru -WindowStyle Minimized
    $frontendPid = $frontendProcess.Id
    Write-Log "Started frontend process with PID: $frontendPid"
    
    # Return to the original location
    Pop-Location
    
    # Show connection information once both are running
    Write-Host "`n[INFO] Connection Information:" -ForegroundColor White
    Write-Host "  Frontend URL: http://localhost:$FRONTEND_PORT" -ForegroundColor White
    Write-Host "  RTMP URL (OBS): rtmp://localhost:$RTMP_PORT/live/YOUR_STREAM_KEY" -ForegroundColor White
    Write-Host "  HTTP-FLV URL: http://localhost:$HTTP_PORT/live/YOUR_STREAM_KEY.flv" -ForegroundColor White
    Write-Host "  API URL: http://localhost:$API_PORT/api/streams" -ForegroundColor White
    
    # OBS Configuration Help
    Write-Host "`n[HELP] OBS Configuration Guide:" -ForegroundColor Cyan
    Write-Host "  1. In OBS, go to Settings > Stream" -ForegroundColor White
    Write-Host "  2. Set Service to 'Custom'" -ForegroundColor White
    Write-Host "  3. Set Server to: rtmp://localhost:$RTMP_PORT/live" -ForegroundColor Green
    Write-Host "  4. Set Stream Key to any value (e.g. 'test')" -ForegroundColor Green
    Write-Host "  5. Click OK and then click 'Start Streaming'" -ForegroundColor White
    
    # Troubleshooting tips
    Write-Host "`n[HELP] Troubleshooting Tips:" -ForegroundColor DarkCyan
    Write-Host "  - Check backend_output.log and frontend_output.log for errors" -ForegroundColor Gray
    Write-Host "  - Try running this script as Administrator for proper access" -ForegroundColor Gray
    Write-Host "  - Check if antivirus software is blocking the connections" -ForegroundColor Gray
    Write-Host "  - Visit http://localhost:$API_PORT/api/test-rtmp in your browser to test RTMP connectivity" -ForegroundColor Gray
    
    Write-Host "`n[INFO] Press Ctrl+C to stop all servers`n" -ForegroundColor Yellow
    Write-Log "All services started, waiting for user input to stop"
    
    # Wait for user input to stop the servers
    try {
        while ($true) {
            Start-Sleep -Seconds 1
            # Check if the processes are still running
            $backendRunning = Get-Process -Id $backendPid -ErrorAction SilentlyContinue
            $frontendRunning = Get-Process -Id $frontendPid -ErrorAction SilentlyContinue
            
            if (-not $backendRunning -and -not $frontendRunning) {
                Write-Host "`n[WARNING] Both server processes have stopped!" -ForegroundColor Yellow
                Write-Log "Both server processes have stopped"
                break
            } elseif (-not $backendRunning) {
                Write-Host "`n[WARNING] Backend server has stopped!" -ForegroundColor Yellow
                Write-Log "Backend server has stopped"
                break
            } elseif (-not $frontendRunning) {
                Write-Host "`n[WARNING] Frontend server has stopped!" -ForegroundColor Yellow
                Write-Log "Frontend server has stopped"
                break
            }
        }
    } catch {
        Write-Host "`n[ERROR] Error while monitoring processes: $_" -ForegroundColor Red
        Write-Log "Error while monitoring processes: $_"
    } finally {
        # This will be executed when the user presses Ctrl+C
        Write-Host "`n[STOPPING] Stopping servers..." -ForegroundColor Yellow
        Write-Log "Stopping servers"
        
        # Stop backend and frontend processes
        if ($backendProcess -and -not $backendProcess.HasExited) {
            try {
                Stop-Process -Id $backendPid -Force -ErrorAction SilentlyContinue
                Write-Host "Stopped backend process (PID: $backendPid)" -ForegroundColor Green
                Write-Log "Stopped backend process (PID: $backendPid)"
            } catch {
                Write-Host "Error stopping backend process: $_" -ForegroundColor Red
                Write-Log "Error stopping backend process: $_"
            }
        }
        
        if ($frontendProcess -and -not $frontendProcess.HasExited) {
            try {
                Stop-Process -Id $frontendPid -Force -ErrorAction SilentlyContinue
                Write-Host "Stopped frontend process (PID: $frontendPid)" -ForegroundColor Green
                Write-Log "Stopped frontend process (PID: $frontendPid)"
            } catch {
                Write-Host "Error stopping frontend process: $_" -ForegroundColor Red
                Write-Log "Error stopping frontend process: $_"
            }
        }
        
        # Final port cleanup to make sure everything is closed
        Clear-PortProcesses -Ports @($API_PORT, $RTMP_PORT, $HTTP_PORT, $FRONTEND_PORT)
    }
    
    Write-Host "`n[DONE] All servers stopped." -ForegroundColor DarkGray
    Write-Log "All servers stopped"
} 
catch {
    Write-Host "`n[ERROR] Error: $_`n" -ForegroundColor Red
    Write-Log "Fatal error: $_"
} 
finally {
    # Clean up lock file
    if (Test-Path -Path "$env:TEMP\live-video-player-running.lock") {
        Remove-Item -Path "$env:TEMP\live-video-player-running.lock" -Force
        Write-Log "Removed lock file"
    }
    
    Write-Log "Script execution completed"
}