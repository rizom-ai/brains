ARG BUN_VERSION=1.3.10
FROM oven/bun:${BUN_VERSION}-slim AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git gnupg debian-keyring debian-archive-keyring apt-transport-https \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list \
    && apt-get update && apt-get install -y --no-install-recommends caddy libcap2-bin \
    && setcap cap_net_bind_service=+ep $(which caddy) \
    && rm -rf /var/lib/apt/lists/*

COPY deploy/Caddyfile /etc/caddy/Caddyfile

RUN mkdir -p /srv/fallback && \
    printf '<!doctype html><html><head><meta charset="utf-8"><title>brain</title></head><body></body></html>\n' \
    > /srv/fallback/index.html

ENV XDG_DATA_HOME=/data
ENV XDG_CONFIG_HOME=/config
RUN mkdir -p /app/data /app/cache /app/brain-data && \
    chmod -R 777 /app/data /app/cache /app/brain-data

CMD ["sh", "-c", "caddy start --config /etc/caddy/Caddyfile && exec ./node_modules/.bin/brain start"]

# --- standalone: bake full project into image (brain-cli deploy) ---
FROM runtime AS standalone
COPY package.json ./package.json
RUN bun install --production --ignore-scripts
COPY . .

# --- fleet: install published brain at pinned version (ops deploy) ---
FROM runtime AS fleet
ARG BRAIN_VERSION
RUN test -n "$BRAIN_VERSION" \
 && printf '{"name":"rover-pilot-runtime","private":true}\n' > package.json \
 && bun add @rizom/brain@$BRAIN_VERSION
