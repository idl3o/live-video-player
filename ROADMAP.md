# Live Video Player — Roadmap

A 6–9 month plan to take this from "compiles and streams" to "runnable by strangers on the public internet."

> **Update — Web3 sprint complete.** The five Web3 primitives originally
> queued for Phase 3 (SIWE identity, USDC tipping, Superfluid per-second
> payment streams, Storacha/Filecoin pinning, EAS attestation substrate)
> have been pulled forward and shipped on Base Sepolia. The phases below
> describe the original conventional plan; consider Phase 1's auth/identity
> work and most of Phase 3 done. The remaining priorities are HLS (mobile
> playback), tests/CI, database persistence beyond wallet-as-identity, and
> the deploy story (Phase 4).

## North star

A self-hostable, single-node live streaming platform where:
- A streamer can register, get a stream key, push from OBS, and have viewers watch on any device including iPhone.
- Recordings are automatically archived to IPFS with a verifiable content hash.
- A small operator can deploy the whole thing with `docker compose up` behind Caddy and have TLS, persistent users, and persistent recordings.

Anything beyond that — federation, P2P delivery, creator tokens, multi-node — is **explicitly out of scope** for this roadmap. We earn the right to build those by first making the single-node case undeniably good.

---

## Phase 1 — Production foundations (months 1–2)

Goal: make it not embarrassing to deploy.

### Deliverables
- **Persistent auth.** Replace [AuthService.ts](backend/src/services/AuthService.ts) in-memory `Map` with SQLite via `better-sqlite3`. Tables: `users`, `sessions`, `stream_keys`. Migration runner (umzug or hand-rolled).
- **Secret hardening.** Backend refuses to start in `NODE_ENV=production` if `JWT_SECRET` or `STREAM_SECRET` are the defaults. `.env.example` at the repo root documents every env var the system understands.
- **HLS output for mobile.** Add `hls: true` to NMS `trans.tasks`. Frontend gains an HLS path using `hls.js`, with flv.js as fallback when the browser supports it and HLS isn't ready yet. iPhone users can finally watch.
- **Static-serve foot-gun fixed.** Stop serving the project root as static. Serve only `landing-page.html` and the frontend's built assets.
- **Smoke test suite.** Vitest for backend. Five tests minimum:
  1. Register → login → JWT verifies
  2. `GET /api/streams` while no streams active
  3. NMS `prePublish` rejects bad token, accepts good token
  4. `RecordingService` round-trip: configure → mock complete → IPFS add → metadata file written
  5. Chat: join room, send message, receive on second socket
- **CI.** GitHub Actions runs typecheck + tests on every push. No deploy yet.
- **Chat identity from JWT.** [ChatService.ts:54](backend/src/services/ChatService.ts#L54) takes the username from a JWT instead of the client's self-assertion. Anonymous viewers get a generated `viewer-xxxx` handle.

### Exit criteria
- A fresh clone on a fresh machine can: `npm run install:all && npm run dev`, register a user, push from OBS, watch on iPhone Safari.
- `npm test` passes in CI.
- Restart the backend → users + stream keys + recordings survive.

---

## Phase 2 — The streaming product (months 3–4)

Goal: polish so a non-developer streamer can actually use it.

### Deliverables
- **Streamer UI.** Frontend gains:
  - Register flow (currently only login)
  - Profile / stream-key page with copy-to-clipboard and "regenerate key"
  - Recordings list with playback (HLS-VOD or MP4)
  - Mobile-responsive layout (currently dies below ~800px)
- **Stream key in OBS URL.** Document the exact RTMP URL format including `?token=<jwt>` when auth is on. Add an OBS profile export if reasonable.
- **Recording reliability.** Replace the 30s polling loop with a watcher on the expected mp4 path + ffmpeg lifecycle awareness. Failed uploads land in a retry queue persisted to SQLite so they survive restart.
- **Persistent chat.** Move chat history + bans/timeouts into SQLite. Cap at N days of history per room.
- **Logging.** Replace [LoggerService.ts](backend/src/services/LoggerService.ts) console.log wrapper with `pino`. Structured JSON to stdout, pretty-printed in dev. No log files in the repo.
- **Frontend error UX.** Real error states for: stream offline, auth expired, network drop during playback, chat disconnect with reconnect.
- **Blockchain decision point** (see Phase 3 prep).

### Exit criteria
- A streamer who has never seen this repo can: sign up, find their stream key, configure OBS using on-page instructions, go live, and check their recordings page after streaming.
- Backend logs are structured JSON ready for `jq` or a log aggregator.
- Test coverage on critical paths (auth, recording lifecycle, RTMP auth hook) > 60%.

---

## Phase 3 — Decentralization, for real (months 5–6)

This phase has two branches. Pick **one** at the end of Phase 2.

### Branch A: Keep blockchain, make it earn its keep

The current [blockchain/](blockchain/) is the Hardhat default sample. If it stays, it needs to do something.

- **`LiveStreamContent.sol` content registry.** A streamer can call `registerContent(cid, title, streamerAddress, timestamp)` to anchor a recording's CID on chain. Read API: anyone can verify "this CID was claimed by this address at this time."
- **Backend integration.** After successful IPFS upload, [RecordingService.ts](backend/src/services/RecordingService.ts) optionally calls the contract via `ethers`. Env-gated: `BLOCKCHAIN_ENABLED=true` + RPC URL + private key OR wallet-connect-from-frontend signing flow.
- **Wallet connect on the frontend.** Streamers connect a wallet, sign the registration transaction client-side (preferred over server holding keys).
- **Verification badge.** Recordings page shows "verified on Polygon Mumbai" or whichever chain you target, with block explorer link.
- **Pick a chain.** Mumbai/Sepolia for testnet through Phase 3. Mainnet only after audit (not in this roadmap).

### Branch B: Drop blockchain, double down on IPFS

If blockchain isn't earning its keep, delete it.

- Remove [blockchain/](blockchain/) entirely.
- Rewrite [README.md](README.md) to drop blockchain promises. Reframe decentralization story around IPFS: "content-addressed recordings that survive even if your node goes down."
- **Real remote pinning.** Wire up Pinata or Web3.Storage (the placeholder entries in the old config did nothing). Streamers' recordings stay reachable via public gateways without the home node.
- **Public gateway fallback in [IPFSService.ts](backend/src/services/IPFSService.ts).** If local Helia can't serve a CID, redirect to `https://ipfs.io/ipfs/<cid>` or a configured gateway.

### Exit criteria
- README's claims match what the code does. No more "coming soon" promises in the public face.
- The decentralization feature is something a user can demo in 30 seconds.

---

## Phase 4 — Operate (months 7–9)

Goal: a one-command deploy that someone other than you can actually run.

### Deliverables
- **Docker Compose.** Single `docker-compose.yml` brings up: backend (with NMS), frontend (built and served by backend's static handler or a tiny nginx), Caddy in front for TLS, optional persistent volume for SQLite + IPFS repo + recordings.
- **Deploy guide.** `docs/deploy.md` walks through: domain pointing, env vars, OBS setup against the deployed instance, backup of SQLite + IPFS repo.
- **Multi-bitrate transcoding** (optional, default off). NMS supports transcoding to multiple HLS variants via `trans.tasks`. Off by default because it's CPU-heavy on small VPS.
- **Stream health monitoring.** Detect stalled publishers (no frames for N seconds) and auto-disconnect. Surface in the streamer dashboard.
- **Moderation dashboard.** Admin-only UI to: list active streams, see chat for any room, ban/timeout users globally, kill a misbehaving publisher.
- **Load test.** Drive 100 concurrent viewers from an external box against a deployed instance. Tune `chunk_size`, `gop_cache`, HLS segment length based on results. Document the breaking point.
- **Delete PowerShell cruft.** Once Docker compose is the canonical path, remove [start-servers.ps1](start-servers.ps1), [setup-test-env.ps1](setup-test-env.ps1), [setup-fullstack.ps1](setup-fullstack.ps1), [performance-test.ps1](performance-test.ps1). Keep [test-video-generator.ps1](test-video-generator.ps1) only if no ffmpeg-script equivalent exists yet — otherwise port it to bash/node and delete.

### Exit criteria
- A stranger on the internet can `git clone && docker compose up`, point a domain at it, and have a working live streaming site within an hour.
- Documented breaking point under load (viewers / bitrate / hardware tier).
- No PowerShell in the repo unless it's the only sane way to do something Windows-specific.

---

## Cross-cutting concerns (every phase)

- **Test coverage** grows monotonically. New code lands with tests.
- **Security review** at the end of each phase. OWASP top 10 pass, dependency audit (`npm audit` clean for high/critical).
- **CHANGELOG.md** updated per phase exit.
- **No new "coming soon" promises** in README, ever. If it's not coded, it's not advertised.

---

## Explicitly out of scope for this roadmap

These are real and interesting but defer them past month 9:

- **Federation between instances.** ActivityPub-style "follow streams on other instances." Sounds great, hard to do well, would consume an entire roadmap by itself.
- **P2P viewer delivery.** WebRTC mesh, hybrid CDN-P2P. Real cost savings, real complexity. After we have viewers worth saving bandwidth on.
- **Creator tokens / microtransactions.** Compliance, KYC, custody — every one of these is a project.
- **Edge / multi-node deploy.** Single-node first. Earn the right to scale by being undeniably good at small.
- **Native mobile apps.** PWA is enough through month 9.

---

## Decision points along the way

These are the calls that meaningfully change the next phase. Make them at phase boundaries, not in the middle of one.

1. **End of Phase 1**: do we have actual users (even 5)? If no, slow down Phase 2 and harden more. If yes, accelerate UX.
2. **End of Phase 2**: blockchain Branch A or B? Decide based on whether anyone using the product has actually asked for on-chain verification, vs whether IPFS alone is enough.
3. **End of Phase 3**: ship deploy as docker compose (current plan) or as a hosted offering you run? Hosted is way more work but unlocks non-technical users.

---

## A note on pacing

These are calendar months assuming roughly one engineer at part-time intensity (~10–15 hrs/week). At full-time, fold the whole thing in half. At 5 hrs/week, double it. The phase ordering and exit criteria don't change; the dates do.

The bigger trap is **starting Phase 4 before Phase 1 is actually done.** Foundation problems compound — an in-memory user store will bite you again every time you add a feature that depends on user identity. Don't move on until exit criteria are met, not just mostly met.
