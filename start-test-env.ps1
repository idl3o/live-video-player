# Quick script to start testing environment
param(
    [switch]$Debug = $false
)

$WorkspaceRoot = $PSScriptRoot
$BackendPath = Join-Path $WorkspaceRoot "backend"
$FrontendPath = Join-Path $WorkspaceRoot "frontend"

# Start backend server in a new window
Start-Process -FilePath "cmd.exe" -ArgumentList "/k cd /d $BackendPath && npm run dev" -WindowStyle Normal

# Give backend time to start
Write-Host "Starting backend server..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Start frontend server in a new window
Start-Process -FilePath "cmd.exe" -ArgumentList "/k cd /d $FrontendPath && npm start" -WindowStyle Normal

Write-Host "
Testing environment started!" -ForegroundColor Green
Write-Host "- Backend is running at http://localhost:45001" -ForegroundColor Cyan
Write-Host "- Frontend is running at http://localhost:3000" -ForegroundColor Cyan
Write-Host "- RTMP URL for OBS: rtmp://localhost:45935/live" -ForegroundColor Cyan
Write-Host "- HTTP-FLV Stream: http://localhost:45000/live/test.flv" -ForegroundColor Cyan

if ($Debug) {
    Write-Host "
To stop the environment, close the terminal windows" -ForegroundColor Yellow
    
    # Keep the main script alive to capture Ctrl+C for clean shutdown
    try {
        Write-Host "Press Ctrl+C to stop all servers..." -ForegroundColor Yellow
        while ($true) { Start-Sleep -Seconds 1 }
    }
    finally {
        Write-Host "Stopping testing environment..." -ForegroundColor Yellow
    }
}
