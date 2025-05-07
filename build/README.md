# Live Video Player - Production Build

This is the production build of the Live Video Player application.

## Setup

1. Run 
pm install in this directory to install dependencies
2. Configure environment variables if needed
3. Run 
pm start to start the server

The application will be available at http://localhost:45001 by default.

## Configuration

You can configure the following environment variables:

- PORT: The port for the API server (default: 45001)
- RTMP_PORT: The port for the RTMP server (default: 45935)
- HTTP_PORT: The port for the HTTP-FLV server (default: 45000)

