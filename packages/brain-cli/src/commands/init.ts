import { mkdirSync, writeFileSync, chmodSync } from "fs";
import { join } from "path";

export interface ScaffoldOptions {
  model: string;
  domain?: string | undefined;
  contentRepo?: string | undefined;
  deploy?: boolean | undefined;
  /**
   * If provided, scaffold writes a real `.env` file with `AI_API_KEY=<value>`
   * so the brain can boot immediately after init. `.env.example` is still
   * written as a template for collaborators.
   */
  apiKey?: string | undefined;
}

/**
 * Scaffold a new brain instance directory.
 *
 * Minimal scaffold (default): brain.yaml + .env.example + .gitignore + tsconfig.json
 * Full scaffold (--deploy):   adds deploy.yml, Kamal hooks, CI workflow
 *
 * Apps are config-only directories — no package.json, no source code.
 * The `brain` CLI from `@rizom/brain` reads brain.yaml from cwd and runs.
 *
 * The `tsconfig.json` is the one exception to "no code config": bun needs
 * it to know which JSX runtime to use when compiling Preact components from
 * the brain runtime. It contains only that hint, nothing else.
 */
export function scaffold(dir: string, options: ScaffoldOptions): void {
  const { model } = options;
  const domain = options.domain ?? `${model}.rizom.ai`;

  // Always created
  writeBrainYaml(dir, model, domain, options.contentRepo);
  writeEnvExample(dir);
  writeGitignore(dir);
  writeTsConfig(dir);

  // Real .env only when apiKey was supplied (interactive prompt or --api-key)
  if (options.apiKey) {
    writeEnv(dir, options.apiKey, options.contentRepo);
  }

  // Deploy files only with --deploy
  if (options.deploy) {
    writeDeployYml(dir);
    writePreDeployHook(dir);
    writeDeployWorkflow(dir);
  }
}

function writeBrainYaml(
  dir: string,
  model: string,
  domain: string,
  contentRepo?: string,
): void {
  // When the user passed --content-repo, wire it up explicitly. Otherwise
  // leave the entire git block commented out so the brain boots cleanly
  // without git, and the user has a copy-paste-ready snippet to enable it.
  const gitBlock = contentRepo
    ? `  directory-sync:
    git:
      repo: ${contentRepo.replace("github:", "")}
      authToken: \${GIT_SYNC_TOKEN}
`
    : `  # Uncomment to enable git-backed sync of brain content:
  # directory-sync:
  #   git:
  #     repo: your-org/brain-data
  #     authToken: \${GIT_SYNC_TOKEN}
`;

  const content = `brain: ${model}
domain: ${domain}

# Plugin preset — "core" is the minimal on-ramp. Use "default" or "full"
# for richer presets, or list capability ids in add: / remove: to fine-tune.
preset: core

# Permissions
anchors: []

# Plugin overrides
plugins:
${gitBlock}  mcp:
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
    - AI_API_KEY
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
AI_API_KEY=

# Optional: separate key for image generation (defaults to AI_API_KEY)
# AI_IMAGE_KEY=

GIT_SYNC_TOKEN=

# Optional
MCP_AUTH_TOKEN=
DISCORD_BOT_TOKEN=

# Deploy (only needed with --deploy)
KAMAL_REGISTRY_PASSWORD=
SERVER_IP=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ZONE_ID=
`;

  writeFileSync(join(dir, ".env.example"), content);
}

/**
 * Write a real .env file with the user-provided AI API key.
 *
 * Only the values the user supplied are written. Optional secrets
 * (MCP_AUTH_TOKEN, DISCORD_BOT_TOKEN, etc.) stay in .env.example for
 * the user to copy over when needed. GIT_SYNC_TOKEN is included as an
 * empty placeholder when contentRepo is set so the user knows which
 * env var the brain.yaml git block expects.
 */
function writeEnv(dir: string, apiKey: string, contentRepo?: string): void {
  const lines = [`AI_API_KEY=${apiKey}`];
  if (contentRepo) {
    lines.push("");
    lines.push("# Fill in with a personal access token that has repo write");
    lines.push("GIT_SYNC_TOKEN=");
  }
  lines.push("");
  writeFileSync(join(dir, ".env"), lines.join("\n"));
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
          AI_API_KEY: \${{ secrets.AI_API_KEY }}
          GIT_SYNC_TOKEN: \${{ secrets.GIT_SYNC_TOKEN }}
        run: kamal deploy
`;

  writeFileSync(join(workflowDir, "deploy.yml"), content);
}

function writeGitignore(dir: string): void {
  const content = `.env
.env.*
!.env.example
node_modules
`;

  writeFileSync(join(dir, ".gitignore"), content);
}

// Bun walks up from cwd looking for tsconfig.json to pick a JSX runtime;
// without these hints it defaults to React and Preact components render to
// nothing.
function writeTsConfig(dir: string): void {
  const content = `{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact"
  }
}
`;

  writeFileSync(join(dir, "tsconfig.json"), content);
}
