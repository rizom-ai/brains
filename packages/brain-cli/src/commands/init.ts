import { mkdirSync, writeFileSync, chmodSync } from "fs";
import { join } from "path";

export interface ScaffoldOptions {
  model: string;
  domain?: string;
  contentRepo?: string;
}

/**
 * Scaffold a new brain instance directory.
 *
 * brain.yaml is the single source of truth for instance config.
 * deploy.yml is a static Kamal template — same for all instances,
 * reads instance-specific values from env vars at deploy time.
 * CI extracts values from brain.yaml into env vars.
 */
export function scaffold(dir: string, options: ScaffoldOptions): void {
  const { model } = options;
  const domain = options.domain ?? `${model}.rizom.ai`;

  writeBrainYaml(dir, model, domain, options.contentRepo);
  writeDeployYml(dir);
  writeEnvExample(dir);
  writePreDeployHook(dir);
  writeDeployWorkflow(dir);
  writeGitignore(dir);
}

function writeBrainYaml(
  dir: string,
  model: string,
  domain: string,
  contentRepo?: string,
): void {
  const repo = contentRepo
    ? contentRepo.replace("github:", "")
    : "# your-org/brain-data";

  const content = `brain: "@brains/${model}"
domain: ${domain}

# Permissions
anchors: []

# Plugin overrides
plugins:
  directory-sync:
    git:
      repo: ${repo}
      authToken: \${GIT_SYNC_TOKEN}
  mcp:
    authToken: \${MCP_AUTH_TOKEN}
`;

  writeFileSync(join(dir, "brain.yaml"), content);
}

/**
 * Static Kamal deploy template. Same for ALL brain instances.
 * All instance-specific values come from env vars that CI
 * extracts from brain.yaml.
 */
function writeDeployYml(dir: string): void {
  const content = `service: brain
image: ghcr.io/rizom-ai/<%= ENV['BRAIN_MODEL'] %>

servers:
  web:
    hosts:
      - <%= ENV['SERVER_IP'] %>

proxy:
  ssl: true
  hosts:
    - <%= ENV['BRAIN_DOMAIN'] %>:80
    - preview.<%= ENV['BRAIN_DOMAIN'] %>:81
  app_port: 80

registry:
  server: ghcr.io
  username: rizom-ai
  password:
    - KAMAL_REGISTRY_PASSWORD

env:
  clear:
    NODE_ENV: production
  secret:
    - ANTHROPIC_API_KEY
    - GIT_SYNC_TOKEN
    - MCP_AUTH_TOKEN
    - DISCORD_BOT_TOKEN

volumes:
  - /opt/brain-data:/app/brain-data
  - /opt/brain.yaml:/app/brain.yaml

healthcheck:
  path: /health
  port: 80
`;

  writeFileSync(join(dir, "deploy.yml"), content);
}

function writeEnvExample(dir: string): void {
  const content = `# Required
ANTHROPIC_API_KEY=
GIT_SYNC_TOKEN=

# Optional
MCP_AUTH_TOKEN=
DISCORD_BOT_TOKEN=

# Deploy
KAMAL_REGISTRY_PASSWORD=
SERVER_IP=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ZONE_ID=
`;

  writeFileSync(join(dir, ".env.example"), content);
}

function writePreDeployHook(dir: string): void {
  const hookDir = join(dir, ".kamal", "hooks");
  mkdirSync(hookDir, { recursive: true });

  const content = `#!/usr/bin/env bash
# Upload brain.yaml to server before deploy
IFS=',' read -ra HOSTS <<< "$KAMAL_HOSTS"
for host in "\${HOSTS[@]}"; do
  scp brain.yaml "deploy@\${host}:/opt/brain.yaml"
done
`;

  const hookPath = join(hookDir, "pre-deploy");
  writeFileSync(hookPath, content);
  chmodSync(hookPath, 0o755);
}

function writeDeployWorkflow(dir: string): void {
  const workflowDir = join(dir, ".github", "workflows");
  mkdirSync(workflowDir, { recursive: true });

  const content = `name: Deploy

on:
  push:
    branches: ["main"]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Extract config from brain.yaml
        run: |
          BRAIN_MODEL=$(grep '^brain:' brain.yaml | sed 's/.*@brains\\///' | tr -d '"' | tr -d "'")
          BRAIN_DOMAIN=$(grep '^domain:' brain.yaml | awk '{print $2}')
          echo "BRAIN_MODEL=$BRAIN_MODEL" >> $GITHUB_ENV
          echo "BRAIN_DOMAIN=$BRAIN_DOMAIN" >> $GITHUB_ENV

      - name: Install Kamal
        run: gem install kamal

      - name: Deploy
        env:
          KAMAL_REGISTRY_PASSWORD: \${{ secrets.KAMAL_REGISTRY_PASSWORD }}
          SERVER_IP: \${{ secrets.SERVER_IP }}
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
          GIT_SYNC_TOKEN: \${{ secrets.GIT_SYNC_TOKEN }}
        run: kamal deploy
`;

  writeFileSync(join(workflowDir, "deploy.yml"), content);
}

function writeGitignore(dir: string): void {
  const content = `.env
.env.*
!.env.example
`;

  writeFileSync(join(dir, ".gitignore"), content);
}
