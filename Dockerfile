# syntax=docker/dockerfile:1
#
# Away in one container: Next.js and SQLite, no separate database service.
#
#   docker build -t away .
#   docker run -p 3000:3000 -v away-data:/data -e APP_URL=http://localhost:3000 away
#
# On Render, the blueprint in render.yaml is the shorter path; this file is for
# Fly.io, Railway, a VPS, or anywhere else that speaks Docker.
#
# The image runs as root: the database lives on a volume, and volume ownership
# varies by platform. If you care, add a user and chown /data to match.

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/web/ ./
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    AWAY_DB_PATH=/data/away.db

# Only what `next start` needs at runtime: production dependencies, the build
# output, the static files and the config.
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY apps/web/next.config.ts ./next.config.ts

# The database file lives here. Without a volume it is created, seeded and lost
# on every start — a demo, not a deployment.
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
