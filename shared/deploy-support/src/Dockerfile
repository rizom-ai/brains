ARG BUN_VERSION=1.3.10
FROM oven/bun:${BUN_VERSION}-slim AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

ENV XDG_DATA_HOME=/data
ENV XDG_CONFIG_HOME=/config
RUN mkdir -p /app/data /app/cache /app/brain-data && \
    chmod -R 777 /app/data /app/cache /app/brain-data

EXPOSE 8080

CMD ["./node_modules/.bin/brain", "start"]

# --- standalone: bake full project into image (brain-cli deploy) ---
FROM runtime AS standalone
COPY package.json ./package.json
RUN bun install --production --ignore-scripts
RUN bunx playwright-core install --with-deps chromium-headless-shell \
 && rm -rf /var/lib/apt/lists/* /tmp/*
COPY . .

# --- fleet: install published brain at pinned version (ops deploy) ---
FROM runtime AS fleet
ARG BRAIN_VERSION
# playwright-core is also installed explicitly so the chromium install
# below resolves against an installed package rather than relying on
# transitive resolution from @rizom/brain. The brain bundle externalizes
# playwright-core, so a missing or mismatched install would fail at
# runtime rather than build time.
RUN test -n "$BRAIN_VERSION" \
 && printf '{"name":"rover-pilot-runtime","private":true}\n' > package.json \
 && bun add @rizom/brain@$BRAIN_VERSION playwright-core
RUN bunx playwright-core install --with-deps chromium-headless-shell \
 && rm -rf /var/lib/apt/lists/* /tmp/*
