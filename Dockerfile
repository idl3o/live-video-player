# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the Live Video Player.
#
# Stage 1 — build the Vite frontend → frontend/dist/
# Stage 2 — build the TypeScript backend → backend/dist/
# Stage 3 — slim runtime image with just node + ffmpeg-static and the compiled
#           output. The backend serves the built frontend statically (see the
#           static-serve block in backend/src/server.ts), so we don't need a
#           separate nginx.

###############################################################################
# Stage 1: frontend build
###############################################################################
FROM node:20-alpine AS frontend
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund

COPY frontend/ ./
# VITE_* envs are baked in at build time; pass them as Docker build args
# if you need values other than the defaults documented in .env.example.
ARG VITE_WALLETCONNECT_PROJECT_ID
ARG VITE_PAYMENT_SUPER_TOKEN
ARG VITE_EAS_STREAMER_ENDORSEMENT_SCHEMA
ARG VITE_EAS_CLIP_PRAISE_SCHEMA
RUN npm run build

###############################################################################
# Stage 2: backend build
###############################################################################
FROM node:20-alpine AS backend-build
WORKDIR /app/backend

# Native builds (bcrypt) need a toolchain in alpine.
RUN apk add --no-cache python3 make g++ libc6-compat

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund

COPY backend/ ./
RUN npm run build

# Trim dev dependencies for the runtime image.
RUN npm prune --omit=dev --legacy-peer-deps

###############################################################################
# Stage 3: runtime
###############################################################################
FROM node:20-alpine
WORKDIR /app

# Runtime libs: ffmpeg comes from the ffmpeg-static npm package (carried in
# node_modules), but it dynamically links against libstdc++ on alpine which
# isn't present by default. libc6-compat covers that and is small.
RUN apk add --no-cache libc6-compat tini

ENV NODE_ENV=production \
    FFMPEG_PATH=/app/node_modules/ffmpeg-static/ffmpeg \
    PORT=45001 \
    RTMP_PORT=45935 \
    HTTP_PORT=45000

# Backend compiled output + pruned node_modules + landing page.
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/package.json ./package.json
COPY landing-page.html /landing-page.html

# Frontend bundle — backend/src/server.ts looks for frontend/dist/ relative
# to project root. dist runs from /app/dist, projectRoot is /app/../ → /
# so the frontend dist lives at /frontend/dist relative to that.
COPY --from=frontend /app/frontend/dist /frontend/dist

# Media + IPFS repo go in volumes (see docker-compose.yml).
RUN mkdir -p /app/media /app/ipfs-repo

EXPOSE 45001 45000 45935

# tini reaps zombie ffmpeg processes that NMS spawns.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
