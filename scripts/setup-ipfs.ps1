# IPFS Setup and Management Script
# This script helps set up and manage IPFS for the live video player

# Variables
$ipfsPath = Join-Path $PSScriptRoot ".." "ipfs"
$kuboPath = Join-Path $ipfsPath "kubo"
$kuboExe = Join-Path $kuboPath "ipfs.exe"
$ipfsRepo = Join-Path $ipfsPath "ipfs-repo"
$ipfsLogPath = Join-Path $PSScriptRoot ".." "ipfs-node.log"

# Create function to display colorful messages
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

# Check if IPFS executable exists
function Test-IPFSInstalled {
    if (Test-Path $kuboExe) {
        return $true
    }
    return $false
}

# Initialize IPFS repository
function Initialize-IPFSRepo {
    Write-ColorOutput Green "Initializing IPFS repository..."
    
    # Set IPFS_PATH environment variable
    $env:IPFS_PATH = $ipfsRepo
    
    # Create repository directory if it doesn't exist
    if (-not (Test-Path $ipfsRepo)) {
        New-Item -Path $ipfsRepo -ItemType Directory -Force | Out-Null
    }
    
    # Initialize the repository
    & $kuboExe init --profile=server
    
    # Configure IPFS for our use case
    & $kuboExe config Addresses.API "/ip4/0.0.0.0/tcp/5001"
    & $kuboExe config Addresses.Gateway "/ip4/0.0.0.0/tcp/8080"
    
    # Enable CORS
    & $kuboExe config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'
    & $kuboExe config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST", "GET"]'
    
    Write-ColorOutput Green "IPFS repository initialized successfully!"
}

# Start IPFS daemon
function Start-IPFSDaemon {
    Write-ColorOutput Green "Starting IPFS daemon..."
    
    # Set IPFS_PATH environment variable
    $env:IPFS_PATH = $ipfsRepo
    
    # Check if daemon is already running
    $ipfsRunning = Get-Process -Name "ipfs" -ErrorAction SilentlyContinue
    
    if ($ipfsRunning) {
        Write-ColorOutput Yellow "IPFS daemon is already running."
        return
    }
    
    # Start the daemon
    Start-Process -FilePath $kuboExe -ArgumentList "daemon" -RedirectStandardOutput $ipfsLogPath -WindowStyle Hidden
    
    # Wait for daemon to start
    $attempts = 0
    $maxAttempts = 10
    
    Write-ColorOutput Yellow "Waiting for IPFS daemon to start (this may take a moment)..."
    
    while ($attempts -lt $maxAttempts) {
        try {
            $attempts++
            $result = Invoke-RestMethod -Uri "http://localhost:5001/api/v0/id" -Method Post -ErrorAction Stop
            Write-ColorOutput Green "IPFS daemon started successfully!"
            Write-ColorOutput Cyan "IPFS Node ID: $($result.ID)"
            return
        }
        catch {
            Start-Sleep -Seconds 2
        }
    }
    
    Write-ColorOutput Red "Failed to start IPFS daemon. Check the log at $ipfsLogPath"
}

# Stop IPFS daemon
function Stop-IPFSDaemon {
    Write-ColorOutput Yellow "Stopping IPFS daemon..."
    
    $ipfsProcess = Get-Process -Name "ipfs" -ErrorAction SilentlyContinue
    
    if ($ipfsProcess) {
        $ipfsProcess | Stop-Process -Force
        Write-ColorOutput Green "IPFS daemon stopped."
    }
    else {
        Write-ColorOutput Yellow "IPFS daemon not running."
    }
}

# Display IPFS status
function Get-IPFSStatus {
    $ipfsRunning = Get-Process -Name "ipfs" -ErrorAction SilentlyContinue
    
    if ($ipfsRunning) {
        Write-ColorOutput Green "IPFS Status: Running"
        try {
            $result = Invoke-RestMethod -Uri "http://localhost:5001/api/v0/id" -Method Post -ErrorAction Stop
            Write-ColorOutput Cyan "IPFS Node ID: $($result.ID)"
            
            # Get peer count
            $peers = Invoke-RestMethod -Uri "http://localhost:5001/api/v0/swarm/peers" -Method Post -ErrorAction Stop
            Write-ColorOutput Cyan "Connected Peers: $($peers.Peers.Count)"
            
            # Get repo stats
            $repoStats = Invoke-RestMethod -Uri "http://localhost:5001/api/v0/repo/stat" -Method Post -ErrorAction Stop
            $repoSizeGB = [math]::Round($repoStats.RepoSize / 1GB, 2)
            Write-ColorOutput Cyan "Repository Size: $repoSizeGB GB"
            
            Write-ColorOutput Cyan "Web UI: http://localhost:5001/webui/"
            Write-ColorOutput Cyan "Gateway: http://localhost:8080/ipfs/<CID>"
        }
        catch {
            Write-ColorOutput Red "IPFS is running but API is not responding properly."
        }
    }
    else {
        Write-ColorOutput Red "IPFS Status: Not Running"
    }
}

# Add a file to IPFS
function Add-FileToIPFS {
    param(
        [Parameter(Mandatory=$true)]
        [string]$FilePath
    )
    
    if (-not (Test-Path $FilePath)) {
        Write-ColorOutput Red "File not found: $FilePath"
        return
    }
    
    Write-ColorOutput Yellow "Adding file to IPFS: $FilePath"
    
    # Set IPFS_PATH environment variable
    $env:IPFS_PATH = $ipfsRepo
    
    try {
        $result = & $kuboExe add $FilePath
        if ($result -match "added (.+?) (.+?)$") {
            $cid = $matches[1]
            Write-ColorOutput Green "File added successfully!"
            Write-ColorOutput Cyan "CID: $cid"
            Write-ColorOutput Cyan "Gateway URL: http://localhost:8080/ipfs/$cid"
            Write-ColorOutput Cyan "Public Gateway URL: https://ipfs.io/ipfs/$cid"
        }
        else {
            Write-ColorOutput Red "Failed to add file to IPFS: $result"
        }
    }
    catch {
        Write-ColorOutput Red "Error adding file to IPFS: $_"
    }
}

# Main script logic
if (-not (Test-IPFSInstalled)) {
    Write-ColorOutput Red "IPFS executable not found at $kuboExe"
    Write-ColorOutput Yellow "Please ensure you have Kubo IPFS installed in the ipfs/kubo directory"
    Write-ColorOutput Yellow "You can download it from: https://dist.ipfs.tech/#kubo"
    exit 1
}

# Display menu
function Show-Menu {
    Write-Host ""
    Write-Host "===== IPFS Management for Live Video Player ====="
    Write-Host "1. Initialize IPFS Repository"
    Write-Host "2. Start IPFS Daemon"
    Write-Host "3. Stop IPFS Daemon"
    Write-Host "4. Check IPFS Status"
    Write-Host "5. Add File to IPFS"
    Write-Host "6. Setup Everything (Initialize & Start)"
    Write-Host "Q. Quit"
    Write-Host "================================================"
    Write-Host ""
}

# Script execution begins
$choice = ""

while ($choice -ne "Q") {
    Show-Menu
    $choice = Read-Host "Select an option"
    
    switch ($choice) {
        "1" {
            Initialize-IPFSRepo
        }
        "2" {
            Start-IPFSDaemon
        }
        "3" {
            Stop-IPFSDaemon
        }
        "4" {
            Get-IPFSStatus
        }
        "5" {
            $filePath = Read-Host "Enter full path to file"
            Add-FileToIPFS -FilePath $filePath
        }
        "6" {
            Initialize-IPFSRepo
            Start-IPFSDaemon
        }
        "Q" {
            Write-ColorOutput Green "Exiting script."
        }
        default {
            Write-ColorOutput Red "Invalid option. Please try again."
        }
    }
    
    if ($choice -ne "Q") {
        Write-Host ""
        pause
    }
}