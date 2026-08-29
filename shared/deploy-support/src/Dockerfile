ARG BUN_VERSION=1.4.0
FROM oven/bun:${BUN_VERSION}-slim AS runtime

LABEL ai.rizom.brain.watchdog="true"

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git tini \
    chromium-headless-shell fontconfig \
    fonts-freefont-ttf fonts-ipafont-gothic fonts-liberation \
    fonts-noto-color-emoji fonts-tlwg-loma-otf fonts-unifont fonts-wqy-zenhei \
    && rm -rf /var/lib/apt/lists/*

ENV BUN_CHROME_PATH=/usr/bin/chromium-headless-shell
ENV XDG_DATA_HOME=/data
ENV XDG_CONFIG_HOME=/config
RUN mkdir -p /app/data /app/cache /app/brain-data && \
    chmod -R 777 /app/data /app/cache /app/brain-data

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl --fail --silent --show-error http://127.0.0.1:8080/health/live || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bun", "--no-orphans", "./node_modules/@rizom/brain/dist/brain.js", "start"]

# --- standalone: bake full project into image (brain-cli deploy) ---
FROM runtime AS standalone
COPY package.json ./package.json
RUN bun install --production --ignore-scripts
COPY . .

# --- fleet: install published brain at pinned version (ops deploy) ---
FROM runtime AS fleet
ARG BRAIN_VERSION
ARG SITE_PACKAGES
RUN test -n "$BRAIN_VERSION" \
 && printf '{"name":"rover-pilot-runtime","private":true}\n' > package.json \
 && if [ -n "$SITE_PACKAGES" ]; then \
      bun add @rizom/brain@$BRAIN_VERSION $SITE_PACKAGES; \
    else \
      bun add @rizom/brain@$BRAIN_VERSION; \
    fi
