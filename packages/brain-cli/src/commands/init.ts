import { mkdirSync, writeFileSync, chmodSync, existsSync } from "fs";
import { basename, dirname, join, resolve as pathResolve } from "path";
import pkg from "../../package.json" with { type: "json" };
import { parseBrainYaml } from "../lib/brain-yaml";
import { buildInstanceEnvSchema } from "../lib/env-schema";

/**
 * Pinned versions written into scaffolded package.json files.
 *
 * `@rizom/brain` is pinned to the same version as the CLI doing the
 * scaffolding — a brain instance is always paired with the framework
 * version it was generated from. `preact` is pinned to a known-good
 * version that matches what the bundled `@rizom/brain/site` was built
 * against; bumping it independently risks JSX runtime mismatches.
 */
const RIZOM_BRAIN_VERSION = `^${pkg.version}`;
const PREACT_VERSION = "^10.27.2";

export interface ScaffoldOptions {
  model: string;
  domain?: string | undefined;
  contentRepo?: string | undefined;
  backend?: string | undefined;
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
 * Minimal scaffold (default): brain.yaml + package.json + README.md +
 *   .env.example + .gitignore + tsconfig.json
 * Full scaffold (`brain init <dir> --deploy`): adds config/deploy.yml, Kamal hooks, CI workflow
 *
 * Idempotent: on an existing directory, only missing conventional
 * artifacts are created. Existing `brain.yaml` is treated as the
 * canonical source of truth for model/domain.
 *
 * The scaffolded shape is a real package: it has its own `package.json`
 * with `@rizom/brain` and `preact` as deps so `bun install && bunx brain
 * start` works from the new dir. It also ships local `src/site.ts` and
 * `src/theme.css` convention files as editable starting points while
 * `brain.yaml` stays pinned to the model's built-in site/theme until the
 * operator opts into the local files. See
 * `docs/plans/harmonize-monorepo-apps.md` for the unified app shape.
 *
 * The `tsconfig.json` ships JSX hints so bun knows to use the Preact
 * runtime when compiling site components.
 */
export function scaffold(dir: string, options: ScaffoldOptions): void {
  const existing = existsSync(join(dir, "brain.yaml"))
    ? parseBrainYaml(dir)
    : undefined;
  const model = existing?.brain ?? options.model;
  const domain = existing?.domain ?? options.domain ?? `${model}.rizom.ai`;

  writeBrainYaml(dir, model, domain, options.contentRepo);
  writePackageJson(dir);
  writeReadme(dir, model);
  writeEnvExample(dir);
  writeGitignore(dir);
  writeTsConfig(dir);
  writeSiteSource(dir);
  writeThemeCss(dir);
  writeEnvSchema(dir, model, options.backend);

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

/**
 * Write a file as part of the scaffold. Skips when the file already
 * exists so `scaffold()` is idempotent across repeated runs. Uses the
 * O_EXCL "wx" flag so the existence check and the create are atomic
 * — no TOCTOU window where another process could race in.
 */
function writeScaffoldFile(
  path: string,
  content: string,
  executable = false,
): void {
  mkdirSync(dirname(path), { recursive: true });
  try {
    writeFileSync(path, content, { flag: "wx" });
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "EEXIST") {
      return;
    }
    throw err;
  }
  if (executable) {
    chmodSync(path, 0o755);
  }
}

function getPinnedSiteTheme(
  model: string,
): { sitePackage: string; themePackage: string } | undefined {
  switch (model) {
    case "rover":
      return {
        sitePackage: "@brains/site-default",
        themePackage: "@brains/theme-default",
      };
    case "ranger":
    case "relay":
      return {
        sitePackage: "@brains/site-rizom",
        themePackage: "@brains/theme-rizom",
      };
    default:
      return undefined;
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

  const pinnedSiteTheme = getPinnedSiteTheme(model);
  const siteBlock = pinnedSiteTheme
    ? `# Start from the model's built-in site/theme. Edit src/site.ts and src/theme.css,
# then remove these refs when you're ready to switch to the local convention.
site:
  package: "${pinnedSiteTheme.sitePackage}"
  theme: "${pinnedSiteTheme.themePackage}"

`
    : "";

  const content = `brain: ${model}
domain: ${domain}

# Plugin preset — "core" is the minimal on-ramp. Use "default" or "full"
# for richer presets, or list capability ids in add: / remove: to fine-tune.
preset: core

${siteBlock}# Permissions
anchors: []

# Plugin overrides
plugins:
${gitBlock}  mcp:
    authToken: \${MCP_AUTH_TOKEN}
`;

  writeScaffoldFile(join(dir, "brain.yaml"), content);
}

/**
 * Static Kamal deploy template. Same for ALL brain instances.
 * All instance-specific values come from env vars that CI
 * extracts from brain.yaml.
 */
function writeDeployYml(dir: string, onlyIfMissing = false): void {
  const content = `service: brain
image: rizom-ai/<%= ENV['BRAIN_MODEL'] %>

servers:
  web:
    hosts:
      - <%= ENV['SERVER_IP'] %>

proxy:
  ssl:
    certificate_pem: CERTIFICATE_PEM
    private_key_pem: PRIVATE_KEY_PEM
  hosts:
    - <%= ENV['BRAIN_DOMAIN'] %>:80
    - preview.<%= ENV['BRAIN_DOMAIN'] %>:81
  app_port: 80
  healthcheck:
    path: /health

registry:
  server: ghcr.io
  username: rizom-ai
  password:
    - KAMAL_REGISTRY_PASSWORD

builder:
  arch: amd64

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
`;

  writeScaffoldFile(join(dir, "config", "deploy.yml"), content, onlyIfMissing);
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
CF_API_TOKEN=
CF_ZONE_ID=
CERTIFICATE_PEM=
PRIVATE_KEY_PEM=
`;

  writeScaffoldFile(join(dir, ".env.example"), content);
}

function writeEnvSchema(dir: string, model: string, backend?: string): void {
  const instanceName = basename(pathResolve(dir));
  writeScaffoldFile(
    join(dir, ".env.schema"),
    buildInstanceEnvSchema(model, instanceName, backend),
  );
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
  writeScaffoldFile(join(dir, ".env"), lines.join("\n"));
}

function writePreDeployHook(dir: string): void {
  const content = `#!/usr/bin/env bash
# Upload brain.yaml to server before deploy
IFS=',' read -ra HOSTS <<< "$KAMAL_HOSTS"
for host in "\${HOSTS[@]}"; do
  scp brain.yaml "deploy@\${host}:/opt/brain.yaml"
done
`;

  writeScaffoldFile(join(dir, ".kamal", "hooks", "pre-deploy"), content, true);
}

function writeDeployWorkflow(dir: string): void {
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
          INSTANCE_NAME="$(basename "$PWD")"
          BRAIN_MODEL="$(grep '^brain:' brain.yaml | sed 's/^brain:[[:space:]]*//' | tr -d '"' | tr -d "'")"
          BRAIN_DOMAIN="$(grep '^domain:' brain.yaml | sed 's/^domain:[[:space:]]*//' | tr -d '"' | tr -d "'")"
          echo "INSTANCE_NAME=$INSTANCE_NAME" >> "$GITHUB_ENV"
          echo "BRAIN_MODEL=$BRAIN_MODEL" >> "$GITHUB_ENV"
          echo "BRAIN_DOMAIN=$BRAIN_DOMAIN" >> "$GITHUB_ENV"

      - name: Load env via varlock
        run: |
          npx -y varlock load --format json --compact > /tmp/varlock-env.json
          node <<'NODE'
          const fs = require('fs');
          const env = JSON.parse(fs.readFileSync('/tmp/varlock-env.json', 'utf8'));
          const githubEnvPath = process.env.GITHUB_ENV;

          if (!githubEnvPath) {
            throw new Error('Missing GITHUB_ENV');
          }

          const lines = Object.entries(env).flatMap(([key, value]) => {
            if (value === null || value === undefined) {
              return [];
            }

            const text = String(value);
            if (text.includes('\\n')) {
              return [key + '<<EOF', text, 'EOF'];
            }

            return [key + '=' + text];
          });

          fs.appendFileSync(githubEnvPath, lines.join('\\n') + '\\n');
          NODE

      - name: Write Kamal SSH key
        run: |
          mkdir -p ~/.ssh
          printf '%s\\n' "$KAMAL_SSH_PRIVATE_KEY" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519

      - name: Write .kamal/secrets
        run: |
          mkdir -p .kamal
          node <<'NODE'
          const fs = require('fs');
          const deployYaml = fs.readFileSync('config/deploy.yml', 'utf8');
          const env = JSON.parse(fs.readFileSync('/tmp/varlock-env.json', 'utf8'));
          const secretNames = new Set([
            'KAMAL_REGISTRY_PASSWORD',
            'CERTIFICATE_PEM',
            'PRIVATE_KEY_PEM',
          ]);

          let inSecrets = false;
          for (const line of deployYaml.split(/\\r?\\n/)) {
            if (/^\\s*secret:\\s*$/.test(line)) {
              inSecrets = true;
              continue;
            }

            if (inSecrets) {
              const match = line.match(/^\\s{4}-\\s*([A-Z0-9_]+)\\s*$/);
              if (match) {
                secretNames.add(match[1]);
                continue;
              }

              if (/^\\S/.test(line)) {
                break;
              }
            }
          }

          const lines = [];
          for (const name of secretNames) {
            const value = env[name];
            if (value === null || value === undefined) {
              continue;
            }

            const text = String(value);
            if (text.includes('\\n')) {
              lines.push(name + '<<EOF', text, 'EOF');
            } else {
              lines.push(name + '=' + text);
            }
          }

          fs.writeFileSync('.kamal/secrets', lines.join('\\n') + '\\n');
          NODE

      - name: Provision server
        id: provision
        run: |
          node <<'NODE'
          const fs = require('fs');

          const token = process.env.HCLOUD_TOKEN;
          const instanceName = process.env.INSTANCE_NAME;
          const sshKeyName = process.env.HCLOUD_SSH_KEY_NAME;
          const outputPath = process.env.GITHUB_OUTPUT;
          if (!token) {
            throw new Error('Missing HCLOUD_TOKEN');
          }
          if (!instanceName) {
            throw new Error('Missing INSTANCE_NAME');
          }
          if (!sshKeyName) {
            throw new Error('Missing HCLOUD_SSH_KEY_NAME');
          }
          if (!outputPath) {
            throw new Error('Missing GITHUB_OUTPUT');
          }

          const headers = {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          };

          const baseUrl = 'https://api.hetzner.cloud/v1';
          const labelSelector = 'brain=' + instanceName;

          async function readJson(response, label) {
            const text = await response.text();
            if (!text) {
              throw new Error(label + ' returned an empty response');
            }

            try {
              return JSON.parse(text);
            } catch {
              throw new Error(label + ' returned invalid JSON: ' + text);
            }
          }

          async function sleep(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
          }

          async function listServers() {
            const response = await fetch(
              baseUrl + '/servers?label_selector=' + encodeURIComponent(labelSelector),
              { headers },
            );
            const payload = await readJson(response, 'Hetzner server lookup');
            if (!response.ok || payload.servers === undefined) {
              throw new Error('Hetzner server lookup failed: ' + JSON.stringify(payload));
            }

            return Array.isArray(payload.servers) ? payload.servers : [];
          }

          async function createServer() {
            const response = await fetch(baseUrl + '/servers', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                name: instanceName,
                server_type: 'cpx21',
                image: 'ubuntu-22.04',
                location: 'nbg1',
                ssh_keys: [sshKeyName],
                labels: { brain: instanceName },
              }),
            });
            const payload = await readJson(response, 'Hetzner server create');
            if (!response.ok || payload.server === undefined) {
              throw new Error('Hetzner server create failed: ' + JSON.stringify(payload));
            }

            return payload.server;
          }

          async function getServer(id) {
            const response = await fetch(baseUrl + '/servers/' + id, { headers });
            const payload = await readJson(response, 'Hetzner server poll');
            if (!response.ok || payload.server === undefined) {
              throw new Error('Hetzner server poll failed: ' + JSON.stringify(payload));
            }

            return payload.server;
          }

          let server = (await listServers())[0];
          if (!server) {
            server = await createServer();
          }

          while (server.status !== 'running' || !server.public_net?.ipv4?.ip) {
            await sleep(10000);
            server = await getServer(server.id);
          }

          const serverIp = server.public_net.ipv4.ip;
          fs.appendFileSync(outputPath, 'server_ip=' + serverIp + '\\n');
          if (process.env.GITHUB_ENV) {
            fs.appendFileSync(process.env.GITHUB_ENV, 'SERVER_IP=' + serverIp + '\\n');
          }
          NODE

      - name: Update Cloudflare DNS
        env:
          SERVER_IP: \${{ steps.provision.outputs.server_ip }}
        run: |
          node <<'NODE'
          const fs = require('fs');

          const token = process.env.CF_API_TOKEN;
          const zoneId = process.env.CF_ZONE_ID;
          const domain = process.env.BRAIN_DOMAIN;
          const serverIp = process.env.SERVER_IP;
          if (!token) {
            throw new Error('Missing CF_API_TOKEN');
          }
          if (!zoneId) {
            throw new Error('Missing CF_ZONE_ID');
          }
          if (!domain) {
            throw new Error('Missing BRAIN_DOMAIN');
          }
          if (!serverIp) {
            throw new Error('Missing SERVER_IP');
          }

          const headers = {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          };
          const baseUrl = 'https://api.cloudflare.com/client/v4';

          async function readJson(response, label) {
            const text = await response.text();
            if (!text) {
              throw new Error(label + ' returned an empty response');
            }

            try {
              return JSON.parse(text);
            } catch {
              throw new Error(label + ' returned invalid JSON: ' + text);
            }
          }

          async function upsertRecord(name) {
            const lookup = await fetch(
              baseUrl + '/zones/' + zoneId + '/dns_records?type=A&name=' + encodeURIComponent(name),
              { headers },
            );
            const payload = await readJson(lookup, 'Cloudflare DNS lookup');
            if (!lookup.ok || !payload.success) {
              throw new Error('Cloudflare DNS lookup failed: ' + JSON.stringify(payload));
            }

            const existing = Array.isArray(payload.result) ? payload.result[0] : undefined;
            const response = await fetch(
              existing
                ? baseUrl + '/zones/' + zoneId + '/dns_records/' + existing.id
                : baseUrl + '/zones/' + zoneId + '/dns_records',
              {
                method: existing ? 'PUT' : 'POST',
                headers,
                body: JSON.stringify({
                  type: 'A',
                  name,
                  content: serverIp,
                  ttl: 1,
                  proxied: true,
                }),
              },
            );
            const result = await readJson(response, 'Cloudflare DNS upsert');
            if (!response.ok || !result.success) {
              throw new Error('Cloudflare DNS upsert failed: ' + JSON.stringify(result));
            }
          }

          await upsertRecord(domain);
          await upsertRecord('preview.' + domain);
          NODE

      - name: Install Kamal
        run: gem install kamal

      - name: Deploy
        env:
          SERVER_IP: \${{ steps.provision.outputs.server_ip }}
        run: kamal deploy --skip-push
`;

  writeScaffoldFile(join(dir, ".github", "workflows", "deploy.yml"), content);
}

function writeGitignore(dir: string): void {
  const content = `.env
.env.*
!.env.example
node_modules
brain.log
brain-data/
dist/
cache/
data/
origin.pem
origin.key
origin.csr
`;

  writeScaffoldFile(join(dir, ".gitignore"), content);
}

/**
 * Write `package.json` for the new brain. The name is derived from the
 * directory basename so `brain init my-brain` produces a package named
 * `my-brain`. `@rizom/brain` is pinned to the version of the CLI doing
 * the scaffolding so the brain is always paired with the framework
 * version it was generated against.
 */
function writePackageJson(dir: string): void {
  const name = basename(dir);
  const content = {
    name,
    private: true,
    type: "module",
    scripts: {
      start: "bunx brain start",
    },
    dependencies: {
      "@rizom/brain": RIZOM_BRAIN_VERSION,
      preact: PREACT_VERSION,
    },
  };

  writeScaffoldFile(
    join(dir, "package.json"),
    JSON.stringify(content, null, 2) + "\n",
  );
}

function writeSiteSource(dir: string): void {
  const content = `import {
  ProfessionalLayout,
  professionalRoutes,
  professionalSitePlugin,
  type SitePackage,
} from "@rizom/brain/site";

/**
 * Local site scaffold.
 *
 * This file is not active until you remove the explicit site.package ref
 * from brain.yaml. Start editing here, then switch brain.yaml to the local
 * convention when you're ready.
 */
const site: SitePackage = {
  layouts: {
    default: ProfessionalLayout,
  },
  routes: professionalRoutes,
  plugin: (config) => professionalSitePlugin(config ?? {}),
  entityDisplay: {
    post: { label: "Post" },
  },
};

export default site;
`;

  writeScaffoldFile(join(dir, "src", "site.ts"), content);
}

function writeThemeCss(dir: string): void {
  const content = `/*
 * Local theme scaffold.
 *
 * This file is not active until you remove the explicit site.theme ref from
 * brain.yaml. Start editing here, then switch brain.yaml to the local
 * convention when you're ready.
 */

:root {
  /* Palette tokens */
  /* --palette-brand-500: #7c3aed; */

  /* Semantic tokens */
  /* --color-brand: var(--palette-brand-500); */
}

[data-theme="dark"] {
  /* Semantic tokens */
  /* --color-brand: #a78bfa; */
}

@theme inline {
  /* --color-brand: var(--color-brand); */
}
`;

  writeScaffoldFile(join(dir, "src", "theme.css"), content);
}

/**
 * Write a minimal README pointing the user at the quickstart commands
 * and explaining the scaffolded layout.
 */
function writeReadme(dir: string, model: string): void {
  const name = basename(dir);
  const content = `# ${name}

A personal brain instance powered by [\`@rizom/brain\`](https://github.com/rizom-ai/brains).

## Quick start

\`\`\`bash
bun install
bunx brain start
\`\`\`

## What's here

- \`brain.yaml\` — instance configuration (model, plugins, secrets, permissions)
- \`package.json\` — pins \`@rizom/brain\` and \`preact\` for module resolution
- \`tsconfig.json\` — JSX runtime hint (Preact)
- \`.env\` — secrets (gitignored, copy from \`.env.example\`)
- \`brain-data/\` — content (created on first sync, gitignored by default)
- \`src/site.ts\` — local site scaffold built on \`@rizom/brain/site\`
- \`src/theme.css\` — local theme scaffold

This brain runs the **${model}** model. Edit \`brain.yaml\` to customize
plugins, change presets, or wire up integrations like Discord and MCP.
`;

  writeScaffoldFile(join(dir, "README.md"), content);
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

  writeScaffoldFile(join(dir, "tsconfig.json"), content);
}
