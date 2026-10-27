# syntax=docker/dockerfile:1

# Node.js LTS on Debian slim: better-sqlite3 and sharp ship prebuilt glibc binaries.
ARG NODE_VERSION=24.22.1
ARG PNPM_VERSION=12.15.0

# --- Build ------------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-trixie-slim AS build
ARG PNPM_VERSION
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global "pnpm@${PNPM_VERSION}"
WORKDIR /app

# Dependencies first, so this layer is reused while only the source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# --- Runtime ----------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-trixie-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data
WORKDIR /app

# Application files stay owned by root: the app user can read them, not change them.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Applied at startup (src/instrumentation.ts). Already traced into standalone; copied
# explicitly so a tracing change can never ship an image without them.
COPY --from=build /app/src/server/db/migrations ./src/server/db/migrations
# The data dictionary shipped in the ZIP export (feature 12, D-50), traced the same way.
COPY --from=build /app/docs/03-data-model.md ./docs/03-data-model.md

# The only writable location. Mount a volume on a local filesystem here (never NFS/SMB).
RUN mkdir -p /data && chown 1000:1000 /data

# uid 1000 is the "node" user of the official image.
USER 1000:1000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "server.js"]
