# Build the static frontend, then serve it with Caddy, which also terminates
# TLS and proxies /api to the API on the private network.
FROM node:20-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Same-origin API: the session cookie stays first-party.
ENV VITE_API_BASE_URL=/api
RUN npm run build

FROM caddy:2.8.4-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/dist /srv
