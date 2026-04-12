ARG BUN_VERSION=1.3.10
FROM oven/bun:${BUN_VERSION}-slim

ARG BRAIN_VERSION
WORKDIR /app

RUN test -n "$BRAIN_VERSION" \
 && printf '{"name":"rover-pilot-runtime","private":true}\n' > package.json \
 && bun add @rizom/brain@$BRAIN_VERSION

ENV XDG_DATA_HOME=/data
ENV XDG_CONFIG_HOME=/config
RUN mkdir -p /app/brain-data /data /config && chmod -R 777 /app/brain-data /data /config

CMD ["sh", "-c", "exec ./node_modules/.bin/brain start"]
