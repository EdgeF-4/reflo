# Reflo API. Built from the monorepo root so the @reflo/domain workspace and the
# widget source are available.
FROM node:20-bookworm-slim AS builder
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

FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app/apps/api
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/packages /app/packages
COPY --from=builder /app/db /app/db
COPY --from=builder /app/apps/api/package.json ./package.json
COPY --from=builder /app/apps/api/dist ./dist
EXPOSE 4000
CMD ["node", "dist/main.js"]
