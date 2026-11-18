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
# The English words and sentences the API may have recorded (server/src/tts.ts).
COPY --from=build /app/src/modules/english/words.ts ./src/modules/english/words.ts
COPY --from=build /app/src/modules/howmany/content.ts ./src/modules/howmany/content.ts
RUN mkdir -p /data/profiles && chown -R node:node /data
ENV NODE_ENV=production PORT=8081 DATA_DIR=/data/profiles
USER node
EXPOSE 8081
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --start-interval=1s \
  CMD node -e "fetch('http://127.0.0.1:8081/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/src/main.ts"]

# Web (default target): static files served by nginx as user nginx (101) on port 8080.
# The official image starts as root; like nginx-unprivileged, drop the user
# directive and move the pid file to /tmp (the temp paths are set in
# deploy/nginx.conf). The greps fail the build if the upstream file changes.
# Exact patch tag: the server builds without --pull, so a cached minor tag
# could still be an old nginx.
FROM nginx:1.31.9-alpine AS web
RUN sed -i -e '/^user /d' -e 's,^pid .*,pid        /tmp/nginx.pid;,' /etc/nginx/nginx.conf \
 && grep -q '^pid        /tmp/nginx.pid;$' /etc/nginx/nginx.conf \
 && ! grep -q '^user ' /etc/nginx/nginx.conf
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
# Traefik only routes to healthy containers: check every second while starting,
# so a deploy causes about a second of downtime instead of half a minute.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --start-interval=1s \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
