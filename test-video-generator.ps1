# PowerShell script to generate a test stream for the local testing environment
# using ffmpeg to stream a local video file to the RTMP server

param(
    [string]$InputVideo = $null,
    [string]$RtmpUrl = "rtmp://localhost:45935/live/test",
    [switch]$Loop = $true,
    [int]$Duration = 0
)

$ErrorActionPreference = "Stop"

# Check if ffmpeg is available
function Test-FFmpeg {
    $ffmpegInstalled = $null -ne (Get-Command ffmpeg -ErrorAction SilentlyContinue)
    return $ffmpegInstalled
}

if (-not (Test-FFmpeg)) {
    Write-Host "ERROR: ffmpeg is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install ffmpeg and add it to your PATH, or install ffmpeg-static via npm." -ForegroundColor Red
    exit 1
}

# If no input video provided, generate a test pattern
if (-not $InputVideo) {
    Write-Host "No input video specified. Generating a test pattern..." -ForegroundColor Yellow
    
    $loopArg = if ($Loop) { "-stream_loop -1" } else { "" }
    $durationArg = if ($Duration -gt 0) { "-t $Duration" } else { "" }
    
    # Command to generate a test pattern with audio tones and stream it to RTMP
    $ffmpegCmd = "ffmpeg $loopArg -f lavfi -i testsrc=size=1280x720:rate=30 -f lavfi -i aevalsrc=`"sin(440*2*PI*t)`" -vcodec libx264 -pix_fmt yuv420p -preset ultrafast -g 20 -b:v 2500k -acodec aac -ab 128k -ar 44100 -f flv $durationArg `"$RtmpUrl`""
    
    Write-Host "Starting test stream to $RtmpUrl" -ForegroundColor Green
    Write-Host "Press Ctrl+C to stop the stream" -ForegroundColor Yellow
    Write-Host "Command: $ffmpegCmd" -ForegroundColor Cyan
    
    # Execute the ffmpeg command
    Invoke-Expression $ffmpegCmd
}
else {
    # Check if the input file exists
    if (-not (Test-Path $InputVideo)) {
        Write-Host "ERROR: Input video file not found: $InputVideo" -ForegroundColor Red
        exit 1
    }
    
    $loopArg = if ($Loop) { "-stream_loop -1" } else { "" }
    $durationArg = if ($Duration -gt 0) { "-t $Duration" } else { "" }
    
    # Command to stream the input file to RTMP
    $ffmpegCmd = "ffmpeg $loopArg -re -i `"$InputVideo`" -c:v libx264 -preset ultrafast -tune zerolatency -c:a aac -ar 44100 -f flv $durationArg `"$RtmpUrl`""
    
    Write-Host "Starting video stream from $InputVideo to $RtmpUrl" -ForegroundColor Green
    Write-Host "Press Ctrl+C to stop the stream" -ForegroundColor Yellow
    Write-Host "Command: $ffmpegCmd" -ForegroundColor Cyan
    
    # Execute the ffmpeg command
    Invoke-Expression $ffmpegCmd
}