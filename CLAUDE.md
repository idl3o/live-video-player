# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Three independent Node projects:

- [backend/](backend/) — TypeScript Express API + Node-Media-Server (RTMP + HTTP-FLV) + Socket.io chat + Helia IPFS + recording pipeline. Entry point: [backend/src/server.ts](backend/src/server.ts).
- [frontend/](frontend/) — Vite + React + TypeScript viewer. Plays HTTP-FLV via flv.js, talks to backend through Vite's dev proxy (port 3000 → 45001).
- [blockchain/](blockchain/) — Hardhat project (Solidity 0.8.28, ethers v6). [LiveStreamContent.sol](blockchain/contracts/LiveStreamContent.sol) is a focused content-registry contract that anchors recording CIDs to creators on chain. Deploy via `npx hardhat ignition deploy ./ignition/modules/LiveStreamContent.ts --network <name>`. 5 tests live in [test/LiveStreamContent.ts](blockchain/test/LiveStreamContent.ts).

## Common commands

### Cross-platform (preferred)
```bash
npm run install:all       # install root + backend + frontend deps
npm run dev               # run backend (45001 + RTMP 45935 + HTTP-FLV 45000) and frontend (3000) in parallel
npm run build             # production build via scripts/build.js
```

### Backend ([backend/](backend/))
```bash
npm install
npm run dev       # nodemon + ts-node, watches src/
npm run build     # tsc -> dist/
npm start         # node dist/server.js (requires prior build)
```

### Frontend ([frontend/](frontend/))
```bash
npm install
npm run dev       # Vite on :3000 with /api, /recordings, /socket.io proxied to backend
npm run build     # tsc -b && vite build -> dist/
npm run typecheck
```

### Blockchain ([blockchain/](blockchain/))
```bash
npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.ts
```

### Windows launchers
`npm run start:win` and `npm run test:env:win` shell out to `start-servers.ps1` / `start-test-env.ps1`. Use these only on Windows — they handle port-killing, firewall rules, and lockfile management. On macOS/Linux use `npm run dev` instead.

### Production deploy ([docs/deploy.md](docs/deploy.md))
```bash
docker compose up -d --build
```
Multi-stage [Dockerfile](Dockerfile) builds frontend + backend into a single image that ships its own ffmpeg via `ffmpeg-static`. [Caddyfile](Caddyfile) terminates TLS via Let's Encrypt and splits routes between the API (45001) and the NMS HTTP server (45000) for HLS. RTMP (45935) is exposed directly because Node-Media-Server doesn't speak RTMPS.

## Architecture notes (the parts that span files)

**Three servers in one process.** [backend/src/server.ts](backend/src/server.ts) starts:
1. Express API on `API_PORT` (default `45001`) — auth, recordings, IPFS, stream listing.
2. Node-Media-Server RTMP ingest on `RTMP_PORT` (default `45935`) — OBS publishes to `rtmp://host:45935/live/<key>?token=<jwt>`.
3. Node-Media-Server HTTP playback on `HTTP_PORT` (default `45000`) — clients pull HLS at `http://host:45000/live/<key>/index.m3u8` (default, iOS-compatible) or HTTP-FLV at `http://host:45000/live/<key>.flv` (low-latency fallback, desktop only). Both come from the same `trans.tasks` config.
4. Socket.io chat is attached to the same HTTP server as the Express API via `ChatService`.

**Auth flow.** REST routes ([backend/src/routes/authRoutes.ts](backend/src/routes/authRoutes.ts)) issue JWTs and are gated by [`authenticate` middleware](backend/src/middleware/authMiddleware.ts). RTMP publish/play are gated separately inside Node-Media-Server `prePublish`/`prePlay` handlers in [server.ts](backend/src/server.ts), which call `AuthService.verifyStreamToken` against the `?token=` query param on the RTMP URL. Two env flags control enforcement:
- `STREAM_AUTH_PUBLISH` — default `true`; set to `false` to allow unauthenticated publishing (dev only).
- `STREAM_AUTH_PLAY` — default `false`; set to `true` to require a token on playback.

**Recording → IPFS pipeline.** Node-Media-Server's built-in `trans.tasks` is configured with `mp4: true` for the `live` app, so each stream records to `media/live/<streamKey>.mp4`. On `donePublish`, [server.ts](backend/src/server.ts) polls for that file (ffmpeg needs a moment to finalize), moves it to `media/recordings/<streamKey>-<timestamp>.mp4`, then hands it to `RecordingService.handleRecordingComplete`, which optionally pushes to IPFS based on [backend/src/config/ipfsConfig.ts](backend/src/config/ipfsConfig.ts).

**IPFS is Helia-only.** [backend/src/services/IPFSService.ts](backend/src/services/IPFSService.ts) runs an embedded Helia node with `FsBlockstore` + `FsDatastore` under [ipfsConfig.embeddedNode.repoPath](backend/src/config/ipfsConfig.ts). Legacy `ipfs-core` / `ipfs-http-client` and explicit libp2p assembly were removed — Helia bundles libp2p with sensible defaults. Pinning uses `helia.pins.add/rm`.

**Static serving quirk.** Express serves the *project root* (`path.join(__dirname, '../../')`) as static — so anything in the repo root is web-accessible at `http://localhost:45001/`. `GET /` returns [landing-page.html](landing-page.html); `GET /app` redirects to the React dev server at `:3000`.

## Default ports

| Service | Port | Env var |
|---|---|---|
| Express API | 45001 | `PORT` |
| RTMP ingest | 45935 | `RTMP_PORT` |
| HTTP-FLV playback | 45000 | `HTTP_PORT` |
| Frontend dev | 3000 | — |

## Testing

There is no automated test suite. Manual flow:
1. `npm run install:all` then `npm run dev` (or `npm run start:win` on Windows).
2. Open `http://localhost:3000`, sign in as `admin` / `adminpassword` (seeded by [authRoutes.ts](backend/src/routes/authRoutes.ts)).
3. Point OBS at `rtmp://localhost:45935/live` with stream key matching the user's `streamKey` (visible in the user bar) and `?token=<jwt>` query if `STREAM_AUTH_PUBLISH=true`. On Windows, [test-video-generator.ps1](test-video-generator.ps1) streams a synthetic pattern via ffmpeg.
4. View the stream from the frontend stream list.
