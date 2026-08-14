# Runtime image for the app (§11.4). Built for linux/amd64 and linux/arm64 so
# the same image runs on a laptop and on the Raspberry Pi 5 — see docs/DEPLOY.md.
#
# Debian slim rather than Alpine on purpose: sharp ships prebuilt libvips
# binaries for glibc, and photo processing is not something to debug on a Pi.

# --- dependencies -----------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
# The build needs devDependencies (typescript, tailwind, serwist).
# minimumReleaseAge=0: the image installs exactly what the committed lockfile
# pins, so the "too freshly published" guard has nothing left to protect here —
# and without it an image built the day after a dependency bump cannot build.
RUN pnpm install --frozen-lockfile --config.minimumReleaseAge=0

# --- build ------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Standalone output only in the image: on a Windows dev machine the symlinks it
# creates fail with EPERM (D-012).
ENV BUILD_STANDALONE=1 NEXT_TELEMETRY_DISABLED=1
# A build-time value is required, never used: the schema is only read for types.
ENV DATABASE_URL=postgres://build:build@127.0.0.1:5432/build
RUN pnpm build
# Next bundles drizzle/postgres into its server chunks rather than leaving them
# in node_modules, so the migration runner gets its own single-file bundle.
RUN pnpm exec esbuild scripts/migrate.mjs   --bundle --platform=node --format=esm --target=node22   --outfile=migrate.bundle.mjs

# --- runtime ----------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# curl for the healthcheck; everything else the app needs is in the bundle.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 1001 --home /app domacnost

COPY --from=build --chown=domacnost:domacnost /app/.next/standalone ./
COPY --from=build --chown=domacnost:domacnost /app/.next/static ./.next/static
COPY --from=build --chown=domacnost:domacnost /app/public ./public
# SQL migrations + the plain-JS runner used by the one-shot `migrate` service.
COPY --from=build --chown=domacnost:domacnost /app/src/db/migrations ./migrations
COPY --from=build --chown=domacnost:domacnost /app/migrate.bundle.mjs ./scripts/migrate.mjs

# Photos live on a volume; the directory must belong to the app user.
RUN mkdir -p /data/uploads && chown -R domacnost:domacnost /data
ENV UPLOADS_DIR=/data/uploads

USER domacnost
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
