# Live Video Player

*Self-hostable live streaming where the Web3 layer is opt-in, not bolted on.*

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Chain](https://img.shields.io/badge/chain-Base%20Sepolia-0052FF)
![Status](https://img.shields.io/badge/status-experimental-orange)

Open, self-hosted infrastructure for creators: stream from OBS, let people watch on any device (iPhone included), optionally take crypto payments, and archive every recording to Filecoin while anchoring it to its creator on-chain. The whole stack comes up from a single `docker compose` file behind Caddy with automatic TLS.

The streaming pipeline itself is deliberately conventional — RTMP ingest via [Node-Media-Server](https://github.com/illuspas/Node-Media-Server), transcoded to HLS (the default, iOS-compatible path) with HTTP-FLV available as a lower-latency fallback. The Web3 features sit alongside it and are each independently env-gated, so you can run a plain streaming server with no wallet integration at all, or switch pieces on one at a time. It is built by someone working at the intersection of Web3, AI and philosophy, and the design bias throughout is towards infrastructure a creator can actually own and run themselves.

## What's inside

Every on-chain feature targets **Base Sepolia testnet** by default, and the UI hides anything that isn't configured. Each row is gated by the environment variables shown; leave them unset and the feature simply doesn't appear.

| Feature | What it does | Gated by |
|---|---|---|
| Live streaming | OBS → RTMP → HLS + HTTP-FLV. iOS Safari plays HLS natively; other clients can use FLV. | none |
| Wallet sign-in (SIWE) | Sign-In With Ethereum via `siwe`; the wallet is the user identity. | `VITE_WALLETCONNECT_PROJECT_ID` |
| USDC tipping | One-shot USDC transfers with recent tips read back from on-chain events. | wallet only |
| Per-second payment streams | Superfluid constant-flow streams that start and stop with playback. | `VITE_PAYMENT_SUPER_TOKEN` |
| Filecoin-pinned recordings | Finished mp4s are pinned locally via Helia, then mirrored to Storacha. | `STORACHA_KEY`, `STORACHA_PROOF` |
| EAS attestations | Clip praise and streamer endorsements surface as on-chain attestation badges. | `VITE_EAS_CLIP_PRAISE_SCHEMA`, `VITE_EAS_STREAMER_ENDORSEMENT_SCHEMA` |
| On-chain content registry | `LiveStreamContent.sol` anchors each recording's CID to its creator, first-writer-wins. | `VITE_LIVE_STREAM_CONTRACT` |
| Live chat | Socket.io chat with identity derived from the SIWE-issued JWT. | wallet for authenticated chat |

See [`.env.example`](.env.example) for the complete list, including the provisioning commands for Storacha, EAS schemas and the registry contract.

## Tech stack

Three workspaces in one repository, all TypeScript:

- **backend/** — Express + [Node-Media-Server](https://github.com/illuspas/Node-Media-Server) for RTMP/HLS/FLV, Socket.io for chat, [Helia](https://github.com/ipfs/helia) + `@storacha/client` for IPFS/Filecoin, `siwe` + `jsonwebtoken` for auth, `helmet` for headers. Tested with Vitest.
- **frontend/** — React 18 + Vite, [wagmi](https://wagmi.sh/) v2 + [viem](https://viem.sh/) + [RainbowKit](https://www.rainbowkit.com/) for wallets, `siwe` for sign-in, and `flv.js` + `hls.js` for playback.
- **blockchain/** — a [Hardhat](https://hardhat.org/) project (Solidity 0.8.20, ethers v6, OpenZeppelin, Ignition deployments) housing the `LiveStreamContent` registry.

Reverse proxy and TLS are handled by [Caddy](Caddyfile).

## Getting started

### Local development

```bash
npm run install:all   # installs root, backend and frontend deps
npm run dev            # runs backend and frontend together
```

The frontend dev server listens on `http://localhost:3000`. The backend uses port `45001` for the API, `45935` for RTMP ingest, and `45000` for HLS/FLV media (all overridable via `.env`).

Point OBS at:

- **Server:** `rtmp://localhost:45935/live`
- **Stream key:** your key, with `?token=<jwt>` appended when publish auth is on (the default — set `STREAM_AUTH_PUBLISH=false` to disable).

### Production (Docker)

```bash
cp .env.example .env
# set at least JWT_SECRET and STREAM_SECRET to strong values; the backend
# refuses to start in production with the documented dev defaults.
docker compose up -d --build
```

`docker-compose.yml` brings up the backend (API + Node-Media-Server) and Caddy for TLS termination and reverse proxying. RTMP is exposed directly because Node-Media-Server doesn't speak RTMPS. See [`docs/deploy.md`](docs/deploy.md) for the full walkthrough.

### Windows-native

PowerShell launchers are provided for native Windows development without Docker:

```powershell
npm run start:win
```

## Project structure

```
backend/     Express + Node-Media-Server API, chat, IPFS/Storacha, auth
frontend/    React + Vite client (wallets, player, chat, recordings)
blockchain/  Hardhat project — LiveStreamContent.sol registry + tests
docs/        Deploy guide and development journal
Dockerfile, docker-compose.yml, Caddyfile   Single-node deploy
ROADMAP.md, CLAUDE.md                        Direction and architecture notes
```

## Status

Experimental and single-node by design. The streaming pipeline, wallet sign-in, tipping, payment streams, Storacha pinning, EAS attestations and the on-chain registry are all wired up against Base Sepolia, and CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs typecheck plus tests on the backend and typecheck plus build on the frontend. Known gaps — no database persistence beyond wallet-derived identity, no frontend tests, and recording completion still handled by a short polling loop — are tracked in [`ROADMAP.md`](ROADMAP.md).

A note on branches: the default branch is `dummy-deployment`, which is where the complete, integrated codebase lives. There is currently no `main`/`master` branch (though CI references one), and the remaining branches are per-feature working branches. Treat `dummy-deployment` as the source of truth for now.

On licensing: released under the [MIT Licence](LICENSE). (Historically the source carried mixed signals — `backend/package.json` declares ISC and the Solidity contract carries an SPDX-MIT header — which the top-level MIT `LICENSE` now settles.)

---

Built by [S. Lavi](https://github.com/idl3o) · [@modsias](https://x.com/modsias)
