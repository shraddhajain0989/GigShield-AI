# ── Build Stage ──
FROM node:22-alpine AS build
WORKDIR /app
COPY server/package*.json ./
RUN npm install
COPY server/ .
COPY database/ /app/database/

# ── Production Stage ──
FROM node:22-alpine
WORKDIR /app

COPY --from=build /app .

RUN chmod +x docker-entrypoint.sh 2>/dev/null || true

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
