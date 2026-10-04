# Build stage: run tests and build the static site with Vite.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --no-audit --no-fund
COPY . .
# Release tag passed in by bin/release.sh (default: dev); shown under /healthz.
ARG APP_VERSION=dev
RUN npm test && npm run build \
 && printf '{"ok":true,"version":"%s"}\n' "${APP_VERSION}" > dist/healthz.json

# API: profiles and saved progress (Node runs the TypeScript sources directly).
# Built with --target api; tests already ran in the build stage.
FROM node:24-slim AS api
WORKDIR /app
COPY --from=build /app/server/src ./server/src
RUN mkdir -p /data/profiles && chown -R node:node /data
ENV NODE_ENV=production PORT=8081 DATA_DIR=/data/profiles
USER node
EXPOSE 8081
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --start-interval=1s \
  CMD node -e "fetch('http://127.0.0.1:8081/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/src/main.ts"]

# Web (default target): static files served by unprivileged nginx on port 8080.
FROM nginxinc/nginx-unprivileged:1.29-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
# Traefik only routes to healthy containers: check every second while starting,
# so a deploy causes about a second of downtime instead of half a minute.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --start-interval=1s \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
