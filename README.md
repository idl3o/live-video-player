# Live Video Player

A self-hostable live streaming platform with on-chain identity and payments.

## What it is

Stream from OBS, watch on any device (including iPhone), pay creators with crypto, and have every recording archived to Filecoin and anchored to its creator on-chain. The whole stack runs from a single Docker compose file behind Caddy with automatic TLS.

The streaming pipeline is conventional: RTMP ingest via [Node-Media-Server](https://github.com/illuspas/Node-Media-Server) → HLS (default, iOS-compatible) and HTTP-FLV (low-latency fallback). The Web3 layer is opt-in per feature, so you can run a vanilla streaming server without any wallet integration if you want.

## Features

All of the on-chain features run on **Base Sepolia testnet** out of the box. Each is independently env-gated and the UI hides anything unconfigured.

| Feature | What it does | Required env |
|---|---|---|
| Live streaming | OBS → RTMP → HLS/FLV. iPhone Safari plays HLS natively; desktop can opt into FLV for ~2s lower latency. | none |
| Wallet sign-in (SIWE) | Sign-In With Ethereum replaces username/password. The wallet *is* the user identity. | `VITE_WALLETCONNECT_PROJECT_ID` |
| USDC tipping | One-shot Circle USDC transfers on Base Sepolia with $0.10 / $1 / $5 presets. Recent tips read from on-chain Transfer events. | wallet only |
| Per-second payment streams | Superfluid Constant Flow Agreements. Pay $1/hr while watching; flow stops on toggle/tab-close. | `VITE_PAYMENT_SUPER_TOKEN` |
| Filecoin-pinned recordings | Every finished mp4 is mirrored to Storacha after the local Helia pin. Survives home-node downtime. | `STORACHA_KEY`, `STORACHA_PROOF` |
| Clip praise + endorsements | EAS attestations on Base Sepolia surface community signal as ★/✦ badges. | `VITE_EAS_CLIP_PRAISE_SCHEMA`, `VITE_EAS_STREAMER_ENDORSEMENT_SCHEMA` |
| On-chain content registry | `LiveStreamContent.sol` anchors each recording's CID to its creator. First writer wins. | `VITE_LIVE_STREAM_CONTRACT` |
| Forge-proof chat | Chat identity is verified from the same JWT issued by SIWE. Anonymous viewers get an `anon-<6hex>` identity with no privileged roles. | wallet for authed chat |
| Cross-platform live recording | Node-Media-Server's `trans.tasks` produces both HLS segments and final mp4s. | none |

See [.env.example](.env.example) for the full list with provisioning commands.

## Run it

### Local dev (macOS / Linux / Windows + WSL2)

```bash
npm run install:all
npm run dev
```

Open http://localhost:3000. Backend API on 45001, RTMP on 45935, HLS/FLV on 45000.

OBS settings:
- Server: `rtmp://localhost:45935/live`
- Stream Key: `<your stream key>?token=<your JWT>` (key visible in the user bar after sign-in)

### Production deploy

```bash
cp .env.example .env
# edit .env: set DOMAIN, JWT_SECRET, STREAM_SECRET at minimum
docker compose up -d --build
```

See [docs/deploy.md](docs/deploy.md) for the full deploy walkthrough — domain pointing, TLS, OBS config, backups.

### Windows-native (no Docker)

PowerShell launchers remain for Windows users who want native dev:
```powershell
npm run start:win
```

## Architecture

Three workspaces in one repo:

- [backend/](backend/) — TypeScript Express + Node-Media-Server + Socket.io chat + Helia IPFS + Storacha + JWT. 24 Vitest tests covering auth, recording lifecycle, middleware, and chat identity.
- [frontend/](frontend/) — Vite + React + TypeScript. wagmi v2 + viem + RainbowKit for wallets. flv.js + hls.js for playback.
- [blockchain/](blockchain/) — Hardhat project (Solidity 0.8.20, ethers v6). [LiveStreamContent.sol](blockchain/contracts/LiveStreamContent.sol) is the on-chain registry. 5 contract tests.

Reverse proxy + TLS via [Caddy](Caddyfile). CI on every push runs typecheck + tests against both backend and frontend ([.github/workflows/ci.yml](.github/workflows/ci.yml)).

Deep dive: [CLAUDE.md](CLAUDE.md).

## Status

The May 2026 sprint shipped 12 PRs taking this from "compiles and streams" to a deployable platform with the full Web3 stack wired in. The honest gaps that remain (no DB beyond wallet-derived identity, no frontend tests, recording lifecycle still polling) are tracked in [ROADMAP.md](ROADMAP.md) and [docs/journal/](docs/journal/).

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgments

Built on [Node-Media-Server](https://github.com/illuspas/Node-Media-Server), [Helia](https://github.com/ipfs/helia), [Storacha](https://storacha.network/), [Superfluid](https://www.superfluid.finance/), [EAS](https://attest.org/), [RainbowKit](https://www.rainbowkit.com/), [viem](https://viem.sh/), [flv.js](https://github.com/bilibili/flv.js), and [hls.js](https://github.com/video-dev/hls.js).
