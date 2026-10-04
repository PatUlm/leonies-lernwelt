# Build stage: run tests and build the static site with Vite.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm test && npm run build

# Runtime stage: static files served by unprivileged nginx on port 8080.
FROM nginxinc/nginx-unprivileged:1.29-alpine
# Release tag passed in by bin/release.sh (default: dev); shown under /healthz.
ARG APP_VERSION=dev
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
RUN printf '{"ok":true,"version":"%s"}\n' "${APP_VERSION}" > /usr/share/nginx/html/healthz.json
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
