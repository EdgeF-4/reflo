# Reflo API. The build image carries development tooling; the smaller runtime
# base and both remote inputs are immutable.
FROM cgr.dev/chainguard/node:latest-dev@sha256:e4d37d94a271c16f34bfb84671abf9a2e4bc66b3e6f948f1d207add3d802f9e5 AS builder
USER root
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/
COPY packages/widget/package.json packages/widget/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mcp/package.json apps/mcp/
RUN npm ci
COPY . .
RUN npm run build:domain && npm run build --workspace @reflo/api
RUN npm prune --omit=dev

FROM cgr.dev/chainguard/node:latest@sha256:34bee3dd9891cbb5e18098ec7f637f6bb691ea11e545eb5ffd737b671c97e47d AS runner
ENV NODE_ENV=production
WORKDIR /app/apps/api
COPY --from=builder --chown=65532:65532 /app/node_modules /app/node_modules
COPY --from=builder --chown=65532:65532 /app/package.json /app/package.json
COPY --from=builder --chown=65532:65532 /app/packages /app/packages
COPY --from=builder --chown=65532:65532 /app/db /app/db
COPY --from=builder --chown=65532:65532 /app/apps/api/package.json ./package.json
COPY --from=builder --chown=65532:65532 /app/apps/api/dist ./dist
USER 65532
EXPOSE 4000
ENTRYPOINT ["/usr/bin/node"]
CMD ["dist/main.js"]
