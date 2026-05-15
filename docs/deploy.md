# Deploying with Docker Compose

A single command stands up the whole stack behind Caddy with automatic TLS.

## Prerequisites

- A host with Docker + Docker Compose (any modern Linux box, Mac, or Windows with WSL2).
- A domain name pointed at the host's public IP (for real TLS). Skip this and use `localhost` for local testing — Caddy will issue an internal self-signed cert.
- Ports 80, 443, and `RTMP_PORT` (default 45935) reachable from the public internet. Open them in your firewall / security group.

## One-time setup

```bash
git clone https://github.com/idl3o/live-video-player.git
cd live-video-player
cp .env.example .env
```

Edit `.env` and at minimum set:

```bash
# Strong random values — the backend refuses to start in production without these
JWT_SECRET=$(openssl rand -hex 32)
STREAM_SECRET=$(openssl rand -hex 32)

# Your domain (or leave as localhost for local TLS testing)
DOMAIN=stream.example.com
```

Optional Web3 features (each is independently env-gated; unset = feature hidden in UI):

```bash
# Frontend (baked into the Vite bundle at build time)
VITE_WALLETCONNECT_PROJECT_ID=...        # from https://cloud.reown.com
VITE_PAYMENT_SUPER_TOKEN=0x...           # Superfluid Super Token on Base Sepolia
VITE_EAS_STREAMER_ENDORSEMENT_SCHEMA=0x... # from https://base-sepolia.easscan.org
VITE_EAS_CLIP_PRAISE_SCHEMA=0x...

# Backend (read at runtime)
STORACHA_KEY=...                          # from `storacha key create`
STORACHA_PROOF=...                        # from `storacha delegation create --base64`
```

See [.env.example](../.env.example) for the full list with comments.

## Bring it up

```bash
docker compose up -d --build
```

First start takes a few minutes (frontend Vite build + backend `tsc` + image assembly). Subsequent starts are seconds.

Check it's healthy:

```bash
docker compose ps
docker compose logs -f backend
```

Visit `https://${DOMAIN}` — you should see the Live Video Player UI. Sign in with a wallet on Base Sepolia.

## Pointing OBS at it

In OBS → Settings → Stream:

- **Service**: Custom
- **Server**: `rtmp://${DOMAIN}:45935/live`
- **Stream Key**: `<your stream key>?token=<your JWT>`

The JWT comes from signing in at `https://${DOMAIN}` and copying the `lvp.token` value from your browser's localStorage. The stream key is shown in the user bar after sign-in. For dev, you can also set `STREAM_AUTH_PUBLISH=false` in `.env` to skip publisher auth.

## What goes where

| Path on host             | What it contains                                                       |
|--------------------------|------------------------------------------------------------------------|
| Docker volume `media`    | Live HLS segments + finalized mp4 recordings (`media/recordings/*.mp4`) |
| Docker volume `ipfs-repo`| Helia blockstore + datastore for local IPFS pinning                    |
| Docker volume `caddy_data` | TLS certificates (Let's Encrypt) and Caddy's persistent state         |

These survive `docker compose down`. They die on `docker compose down -v` — don't run that on a host with anyone's recordings on it.

## Backing up

```bash
# Recordings + IPFS repo are the things that hurt to lose
docker run --rm -v media:/data -v $(pwd):/backup alpine \
  tar czf /backup/media-$(date +%F).tar.gz -C /data .
docker run --rm -v ipfs-repo:/data -v $(pwd):/backup alpine \
  tar czf /backup/ipfs-$(date +%F).tar.gz -C /data .
```

## Updating

```bash
git pull
docker compose up -d --build
```

The build cache reuses layers as long as `package.json` files don't change.

## Troubleshooting

- **`[FATAL] Refusing to start in production with default secrets`** — set strong values for `JWT_SECRET` and `STREAM_SECRET` in `.env`.
- **Caddy can't issue certs** — port 80 must be reachable from the public internet for the ACME HTTP challenge. Check firewall / security group rules. For local testing leave `DOMAIN=localhost`.
- **HLS plays but with a 6-second delay** — that's the configured segment depth (`hls_time=2`, `hls_list_size=3`). Toggle "low-latency (FLV)" in the player UI for sub-2-second latency on desktop browsers.
- **iOS Safari won't autoplay** — Safari requires a user gesture. Tap the play button on the video element.
- **OBS gets "connection rejected"** — `STREAM_AUTH_PUBLISH=true` (default) requires `?token=<jwt>` in the RTMP URL. Sign in, copy the JWT, append it.
- **Recording never gets uploaded to Storacha** — check `docker compose logs backend | grep -i storacha`. Common cause: `STORACHA_PROOF` not base64-encoded; it must be the base64 form from `storacha delegation create --base64`.
- **`docker build` fails with `mount callback failed ... input/output error` during image export** — the host machine is low on disk space; Docker Desktop's VM can't write its build cache. Free space on the host (`df -h`), then `docker system prune -a -f` once the daemon is responsive again. The image build itself takes ~3-5GB of layer space.
- **`docker build` fails with `gyp ERR! find Python`** — fixed in current Dockerfile (both frontend and backend stages install `python3 make g++` in alpine). If you see this on an older checkout, pull the latest.

## What's not in this deploy

- No database. Auth is wallet-derived (SIWE) so wallet users survive restart; the seeded admin re-creates on boot; `allowedToStream` flags on non-wallet users don't persist.
- No monitoring / metrics. Add Prometheus + Grafana if you want them.
- No auto-scaling. The current architecture is single-node only.
- No CDN in front of HLS. Caddy serves segments directly, which is fine until you have ~100 concurrent viewers. Beyond that, fronting with a CDN like bunny.net or Cloudflare Stream is straightforward.
