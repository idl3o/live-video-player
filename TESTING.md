# Live Video Player - Local Testing Environment

This document provides instructions on how to set up and use the local testing environment for the Live Video Player application.

## Prerequisites

- Node.js (v14 or higher recommended)
- npm (v6 or higher recommended)
- ffmpeg (optional, will be installed via npm if not available)
- Windows PowerShell

## Setting Up the Testing Environment

1. Run the setup script to prepare your testing environment:

```powershell
.\setup-test-env.ps1
```

This script will:
- Check for required tools
- Install project dependencies
- Build the backend TypeScript code
- Set up configuration files
- Create necessary directories

### Setup Options

You can customize the setup with these parameters:

```powershell
.\setup-test-env.ps1 -CleanInstall -Force
```

Parameters:
- `-SkipBackendBuild`: Skip building the backend
- `-SkipFrontendBuild`: Skip building the frontend
- `-CleanInstall`: Perform a clean installation (remove node_modules and package-lock.json)
- `-Force`: Force operations even if warnings are encountered

## Starting the Testing Environment

After setup, you can start the testing environment using:

```powershell
npm run test:env
```

Or directly:

```powershell
.\start-test-env.ps1
```

This will:
1. Start the backend server on http://localhost:45001
2. Start the frontend server on http://localhost:3000
3. Configure the RTMP server on rtmp://localhost:45935/live

## Testing with a Video Stream

### Option 1: Using the Test Video Generator

The included test video generator allows you to stream a test pattern or a local video file to the RTMP server without needing OBS:

```powershell
# Stream a test pattern
.\test-video-generator.ps1

# Stream a local video file
.\test-video-generator.ps1 -InputVideo "path\to\your\video.mp4"
```

Parameters:
- `-InputVideo`: Path to a video file to stream (optional)
- `-RtmpUrl`: RTMP URL (default: rtmp://localhost:45935/live/test)
- `-Loop`: Loop the video (default: true)
- `-Duration`: Stream duration in seconds (0 for unlimited)

### Option 2: Using OBS Studio

1. Open OBS Studio
2. Go to Settings > Stream
3. Select "Custom" for Service
4. Enter the following:
   - Server: rtmp://localhost:45935/live
   - Stream Key: test (or any other key you configured)
5. Click "OK" and then "Start Streaming"

## Accessing the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:45001/api
- HTTP-FLV Stream: http://localhost:45000/live/test.flv

## Testing User Accounts

The default testing environment includes these pre-configured accounts:

- Admin User:
  - Username: admin
  - Password: adminpassword
  - Email: admin@example.com

## Troubleshooting

### Common Issues

1. **Port conflicts**: 
   - If ports 45001, 45000, 45935, or 3000 are already in use, modify the .env files and configuration

2. **ffmpeg errors**: 
   - Ensure ffmpeg is properly installed or use the ffmpeg-static npm package
   - Check the backend output log for specific error messages

3. **Video not showing up**:
   - Verify that the RTMP stream is active (check backend logs)
   - Ensure the stream key in the URL matches what you configured in OBS or the test generator

### Accessing Logs

- Backend logs: backend_output.log
- Frontend logs: Check the browser console or frontend_output.log
- Setup logs: test-env-setup.log

## Cleanup

When you're done testing, you can simply close the terminal windows to stop the servers.

## Advanced Configuration

You can modify environment settings by editing:
- Backend: `backend/.env`
- Frontend: `frontend/.env.development.local`