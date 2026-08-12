# Reflo web (admin dashboard + partner portal). Next.js standalone output.
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
# NEXT_PUBLIC_ vars are inlined at build time, so the browser bundle needs the
# API URL it will reach from the user's machine.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace @reflo/web

FROM cgr.dev/chainguard/node:latest@sha256:34bee3dd9891cbb5e18098ec7f637f6bb691ea11e545eb5ffd737b671c97e47d AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=builder --chown=65532:65532 /app/apps/web/.next/standalone ./
COPY --from=builder --chown=65532:65532 /app/apps/web/.next/static ./apps/web/.next/static
USER 65532
EXPOSE 3000
ENTRYPOINT ["/usr/bin/node"]
CMD ["apps/web/server.js"]
