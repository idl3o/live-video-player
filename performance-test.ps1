# PowerShell script to perform performance testing on the Live Video Player
# This script measures initialization time, connection time, and memory usage

param (
    [string]$ApiUrl = "http://localhost:45001",
    [string]$StreamUrl = "http://localhost:45000/live/test.flv",
    [int]$TestDuration = 60,  # Duration in seconds
    [switch]$GenerateReport = $true
)

$ErrorActionPreference = "Stop"
$LogFile = Join-Path $PSScriptRoot "performance-test-results.log"

function Write-LogEntry {
    param (
        [string]$Message,
        [string]$Level = "INFO"
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp [$Level] $Message" | Out-File -Append -FilePath $LogFile
    
    switch ($Level) {
        "ERROR" { Write-Host $Message -ForegroundColor Red }
        "WARNING" { Write-Host $Message -ForegroundColor Yellow }
        "SUCCESS" { Write-Host $Message -ForegroundColor Green }
        default { Write-Host $Message }
    }
}

# Clear previous log
if (Test-Path $LogFile) {
    Clear-Content $LogFile
}

Write-LogEntry "Starting performance test for Live Video Player"
Write-LogEntry "API URL: $ApiUrl"
Write-LogEntry "Stream URL: $StreamUrl"
Write-LogEntry "Test Duration: $TestDuration seconds"

# Check if required tools are available
function Test-Command {
    param([string]$Command)
    return $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

if (-not (Test-Command "node")) {
    Write-LogEntry "Node.js not found, please install Node.js" "ERROR"
    exit 1
}

# Test API server response time
Write-LogEntry "Testing API server response time..."
$apiStartTime = Get-Date
try {
    $apiResponse = Invoke-WebRequest -Uri "$ApiUrl/api/status" -UseBasicParsing -TimeoutSec 10
    $apiEndTime = Get-Date
    $apiResponseTime = ($apiEndTime - $apiStartTime).TotalMilliseconds
    Write-LogEntry "API response time: $apiResponseTime ms" "SUCCESS"
} catch {
    Write-LogEntry "API server not responding or endpoint not available: $_" "ERROR"
}

# Create a temporary Node.js script to test stream loading performance
$tempScript = Join-Path $PSScriptRoot "temp-perf-test.js"

# Write the test script content
@"
const http = require('http');
const https = require('https');
const { performance } = require('perf_hooks');
const url = new URL('$StreamUrl');

console.log('Testing stream initialization time for: $StreamUrl');

const protocol = url.protocol === 'https:' ? https : http;
const startTime = performance.now();

// Test stream connection
const req = protocol.get(url, (res) => {
  const connectTime = performance.now() - startTime;
  console.log(`Connection established in \${connectTime.toFixed(2)} ms`);
  console.log(`Status: \${res.statusCode}`);
  
  // For performance testing, we'll just read the first few chunks of data
  let dataReceived = 0;
  let firstChunkTime = null;
  
  res.on('data', (chunk) => {
    if (!firstChunkTime) {
      firstChunkTime = performance.now();
      console.log(`First chunk received in \${(firstChunkTime - startTime).toFixed(2)} ms`);
    }
    
    dataReceived += chunk.length;
    
    // After receiving some data, we can terminate the test
    if (dataReceived > 100000) {
      console.log(`Received \${dataReceived} bytes`);
      console.log(`Test completed successfully`);
      req.destroy();
      process.exit(0);
    }
  });
  
  // Set a timeout to end the test if it runs too long
  setTimeout(() => {
    console.log('Test duration completed');
    req.destroy();
    process.exit(0);
  }, $TestDuration * 1000);
});

req.on('error', (err) => {
  console.error(`Stream connection error: \${err.message}`);
  process.exit(1);
});
"@ | Out-File -FilePath $tempScript -Encoding utf8

# Run the test script
Write-LogEntry "Testing stream initialization and loading performance..."
try {
    $streamTestOutput = node $tempScript
    foreach ($line in $streamTestOutput) {
        Write-LogEntry $line
    }
} catch {
    Write-LogEntry "Error testing stream: $_" "ERROR"
} finally {
    # Clean up the temporary script
    if (Test-Path $tempScript) {
        Remove-Item $tempScript
    }
}

# Check memory usage of backend server (if running locally)
Write-LogEntry "Checking memory usage of server processes..."
try {
    $nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Path -match "live-video-player" }
    
    if ($nodeProcesses) {
        foreach ($process in $nodeProcesses) {
            $memoryMB = [math]::Round($process.WorkingSet / 1MB, 2)
            $cpuPercent = [math]::Round($process.CPU, 2)
            Write-LogEntry "Process ID $($process.Id): Memory usage $memoryMB MB, CPU usage $cpuPercent%" "INFO"
        }
    } else {
        Write-LogEntry "No live-video-player Node.js processes found running" "WARNING"
    }
} catch {
    Write-LogEntry "Error checking server processes: $_" "ERROR"
}

# Generate performance report if requested
if ($GenerateReport) {
    $reportFile = Join-Path $PSScriptRoot "performance-report.html"
    $reportContent = @"
<!DOCTYPE html>
<html>
<head>
    <title>Live Video Player - Performance Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        .section { margin-bottom: 20px; padding: 15px; border-radius: 5px; background-color: #f5f5f5; }
        .success { color: green; }
        .warning { color: orange; }
        .error { color: red; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <h1>Live Video Player - Performance Test Report</h1>
    <div class="section">
        <h2>Test Configuration</h2>
        <p><strong>Date:</strong> $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")</p>
        <p><strong>API URL:</strong> $ApiUrl</p>
        <p><strong>Stream URL:</strong> $StreamUrl</p>
        <p><strong>Test Duration:</strong> $TestDuration seconds</p>
    </div>
    
    <div class="section">
        <h2>Test Results</h2>
        <pre>$(Get-Content $LogFile -Raw)</pre>
    </div>
    
    <div class="section">
        <h2>Recommendations</h2>
        <ul>
            <li>Aim for API response times under 200ms</li>
            <li>Stream connection should be established in under 500ms</li>
            <li>First video data chunk should arrive within 1000ms</li>
            <li>Memory usage should be monitored for any leaks over time</li>
        </ul>
    </div>
</body>
</html>
"@

    $reportContent | Out-File -FilePath $reportFile -Encoding utf8
    Write-LogEntry "Performance report generated: $reportFile" "SUCCESS"
    
    # Open the report in the default browser
    Start-Process $reportFile
}

Write-LogEntry "Performance test completed" "SUCCESS"