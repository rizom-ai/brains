import {
  mkdirSync,
  writeFileSync,
  chmodSync,
  existsSync,
  readFileSync,
  unlinkSync,
} from "fs";
import { basename, dirname, join, resolve as pathResolve } from "path";
import { fileURLToPath } from "url";
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
   * Regenerate derived deploy artifacts from the current instance sources
   * (for example `.env.schema` → deploy workflow) without rewriting
   * canonical instance config like `brain.yaml`, `.env.schema`, or
   * `config/deploy.yml`.
   */
  regen?: boolean | undefined;
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
 * start` works from the new dir. Models with an active website surface
 * also ship local `src/site.ts` and `src/theme.css` convention files as
 * editable starting points while `brain.yaml` stays pinned to the model's
 * built-in site. The local theme scaffold layers on top of the active
 * base theme automatically; the local site scaffold activates when the
 * operator switches `brain.yaml` to the local site convention.
 *
 * The `tsconfig.json` extends the public `@rizom/brain` instance preset
 * so standalone apps share the same JSX/runtime authoring contract.
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
  if (shouldScaffoldLocalSiteTheme(model)) {
    writeSiteSource(dir);
    writeThemeCss(dir);
  }
  writeEnvSchema(dir, model, options.backend);

  // Real .env only when apiKey was supplied (interactive prompt or --api-key)
  if (options.apiKey) {
    writeEnv(dir, options.apiKey, options.contentRepo);
  }

  // Deploy files only with --deploy
  if (options.deploy) {
    writeDeployYml(dir, options.regen);
    writePreDeployHook(dir, options.regen);
    writeExtractBrainConfigScript(dir, options.regen);
    writeDeployDockerfile(dir, options.regen);
    writePublishWorkflow(dir, options.regen);
    writeDeployWorkflow(dir, options.regen);
    writeSharedDeployScripts(dir, options.regen);
    removeLegacyGeneratedFile(
      join(dir, "deploy", "Caddyfile"),
      legacyCaddyfileContents,
    );
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
  overwrite = false,
): void {
  mkdirSync(dirname(path), { recursive: true });
  if (overwrite) {
    writeFileSync(path, content);
    if (executable) {
      chmodSync(path, 0o755);
    }
    return;
  }
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

function writeReconcilableScaffoldFile(options: {
  path: string;
  content: string;
  executable?: boolean;
  legacyContents?: string[];
  shouldReconcile?: (current: string) => boolean;
}): void {
  const {
    path,
    content,
    executable = false,
    legacyContents = [],
    shouldReconcile,
  } = options;
  mkdirSync(dirname(path), { recursive: true });

  if (!existsSync(path)) {
    writeFileSync(path, content, { flag: "wx" });
    if (executable) {
      chmodSync(path, 0o755);
    }
    return;
  }

  const current = readFileSync(path, "utf-8");
  if (current === content) {
    return;
  }

  const matchesLegacyContent = legacyContents.includes(current);
  const matchesLegacyPredicate = shouldReconcile?.(current) ?? false;
  if (!matchesLegacyContent && !matchesLegacyPredicate) {
    return;
  }

  writeFileSync(path, content);
  if (executable) {
    chmodSync(path, 0o755);
  }
}

function shouldScaffoldLocalSiteTheme(model: string): boolean {
  return model !== "rover";
}

function getPinnedSiteTheme(
  _model: string,
): { sitePackage: string; themePackage: string } | undefined {
  return undefined;
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
# remove site.package when you're ready to switch to the local site convention.
# src/theme.css already layers on top of the built-in theme by default.
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
const legacyEnvExampleContents = [
  `# Required
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
`,
];

const legacyDeployYmlContents = [
  `service: brain
image: rizom-ai/<%= ENV['BRAIN_MODEL'] %>

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
  - /opt/brain-dist:/app/dist
  - /opt/brain.yaml:/app/brain.yaml
`,
];

const legacyDockerfileContents = [
  `ARG BUN_VERSION=1.3.10
FROM oven/bun:\${BUN_VERSION}-slim AS runtime

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
`,
  `FROM oven/bun:1.3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git gnupg debian-keyring debian-archive-keyring apt-transport-https \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list \
    && apt-get update && apt-get install -y --no-install-recommends caddy libcap2-bin \
    && setcap cap_net_bind_service=+ep $(which caddy) \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./package.json
RUN bun install --production --ignore-scripts

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY . .

ENV XDG_DATA_HOME=/data
ENV XDG_CONFIG_HOME=/config
RUN mkdir -p /app/data /app/cache /app/brain-data && \
    chmod -R 777 /app/data /app/cache /app/brain-data

CMD ["sh", "-c", "caddy start --config /etc/caddy/Caddyfile && exec ./node_modules/.bin/brain start"]
`,
];

const legacyCaddyfileContents = [
  `# Internal Caddy — path-based routing to brain services.
# kamal-proxy terminates TLS externally; this runs inside the container.
:80 {
	@preview header_regexp preview_host Host ^(?:preview\\..+|.+-preview\\..+)$
	handle @preview {
		reverse_proxy localhost:4321

		header {
			X-Frame-Options "SAMEORIGIN"
			X-Content-Type-Options "nosniff"
			Referrer-Policy "strict-origin-when-cross-origin"
		}
	}

	# Health endpoint
	handle /health {
		reverse_proxy localhost:3333
	}

	# MCP endpoint
	handle /mcp* {
		reverse_proxy localhost:3333

		header {
			X-Content-Type-Options "nosniff"
			Access-Control-Allow-Origin "*"
			Access-Control-Allow-Methods "GET, POST, DELETE, OPTIONS"
			Access-Control-Allow-Headers "Content-Type, Authorization, MCP-Session-Id"
		}
	}

	# A2A endpoints
	handle /.well-known/agent-card.json {
		reverse_proxy localhost:3334
	}

	handle /a2a {
		reverse_proxy localhost:3334

		header {
			X-Content-Type-Options "nosniff"
			Access-Control-Allow-Origin "*"
			Access-Control-Allow-Methods "GET, POST, OPTIONS"
			Access-Control-Allow-Headers "Content-Type, Authorization"
		}
	}

	# Plugin API routes
	handle /api/* {
		reverse_proxy localhost:3335
	}

	# Production site: prefer the webserver when present; otherwise fall back
	# to the A2A interface so core-only deployments never return a bare 502.
	handle {
		reverse_proxy localhost:8080 localhost:3334 {
			lb_policy first
			lb_retries 1
		}

		header {
			X-Frame-Options "SAMEORIGIN"
			X-Content-Type-Options "nosniff"
			Referrer-Policy "strict-origin-when-cross-origin"
		}
	}
}
`,
  `# Internal Caddy — path-based routing to brain services.
# kamal-proxy terminates TLS externally; this runs inside the container.
:80 {
	@preview host preview.mylittlephoney.com *-preview.*
	handle @preview {
		reverse_proxy localhost:4321

		header {
			X-Frame-Options "SAMEORIGIN"
			X-Content-Type-Options "nosniff"
			Referrer-Policy "strict-origin-when-cross-origin"
		}
	}

	# Health endpoint
	handle /health {
		reverse_proxy localhost:3333
	}

	# MCP endpoint
	handle /mcp* {
		reverse_proxy localhost:3333

		header {
			X-Content-Type-Options "nosniff"
			Access-Control-Allow-Origin "*"
			Access-Control-Allow-Methods "GET, POST, DELETE, OPTIONS"
			Access-Control-Allow-Headers "Content-Type, Authorization, MCP-Session-Id"
		}
	}

	# A2A endpoints
	handle /.well-known/agent-card.json {
		reverse_proxy localhost:3334
	}

	handle /a2a {
		reverse_proxy localhost:3334

		header {
			X-Content-Type-Options "nosniff"
			Access-Control-Allow-Origin "*"
			Access-Control-Allow-Methods "GET, POST, OPTIONS"
			Access-Control-Allow-Headers "Content-Type, Authorization"
		}
	}

	# Plugin API routes
	handle /api/* {
		reverse_proxy localhost:3335
	}

	# Production site: prefer the webserver when present; otherwise fall back
	# to the A2A interface so core-only deployments never return a bare 502.
	handle {
		reverse_proxy localhost:8080 localhost:3334 {
			lb_policy first
			lb_retries 1
		}

		header {
			X-Frame-Options "SAMEORIGIN"
			X-Content-Type-Options "nosniff"
			Referrer-Policy "strict-origin-when-cross-origin"
		}
	}
}
`,
];

const legacyDeployWorkflowContents = [
  `name: Deploy

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
          BRAIN_MODEL=$(grep '^brain:' brain.yaml | sed 's/.*@brains${"\\///"}' | tr -d '"' | tr -d "'")
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
          MCP_AUTH_TOKEN: \${{ secrets.MCP_AUTH_TOKEN }}
        run: kamal deploy --skip-push
`,
];

function writeDeployYml(dir: string, regen = false): void {
  const template = readFileSync(
    join(packageDeployTemplatesDir, "kamal-deploy.yml"),
    "utf-8",
  );
  const content = template.replace("__SERVICE_NAME__", "brain");

  if (regen) {
    writeScaffoldFile(join(dir, "config", "deploy.yml"), content, false, true);
    return;
  }

  writeReconcilableScaffoldFile({
    path: join(dir, "config", "deploy.yml"),
    content,
    legacyContents: legacyDeployYmlContents,
    shouldReconcile: matchesLegacyStandaloneDeployYml,
  });
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
CF_API_TOKEN=
CF_ZONE_ID=
CERTIFICATE_PEM=
PRIVATE_KEY_PEM=
HCLOUD_SSH_KEY_NAME=
HCLOUD_SERVER_TYPE=
HCLOUD_LOCATION=
KAMAL_SSH_PRIVATE_KEY=
`;

  writeReconcilableScaffoldFile({
    path: join(dir, ".env.example"),
    content,
    legacyContents: legacyEnvExampleContents,
  });
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

function writePreDeployHook(dir: string, regen = false): void {
  const content = `#!/usr/bin/env bash
set -euo pipefail

SSH_USER="$(ruby -e 'require "yaml"; config = YAML.load_file("config/deploy.yml") || {}; puts(config.dig("ssh", "user") || "root")')"
IFS=',' read -ra HOSTS <<< "$KAMAL_HOSTS"
for host in "\${HOSTS[@]}"; do
  scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null brain.yaml "\${SSH_USER}@\${host}:/opt/brain.yaml"
done
`;

  writeScaffoldFile(
    join(dir, ".kamal", "hooks", "pre-deploy"),
    content,
    true,
    regen,
  );
}

function writeExtractBrainConfigScript(dir: string, regen = false): void {
  const content = `#!/usr/bin/env ruby
require "yaml"

config = YAML.load_file("brain.yaml") || {}
brain_model = config["brain"]
brain_domain = config["domain"]

raise "Missing brain in brain.yaml" if brain_model.nil? || brain_model.to_s.strip.empty?
raise "Missing domain in brain.yaml" if brain_domain.nil? || brain_domain.to_s.strip.empty?

brain_domain = brain_domain.to_s.strip
labels = brain_domain.split(".")
preview_domain = if labels.length >= 3
  labels.dup.tap { |parts| parts[0] = "#{parts[0]}-preview" }.join(".")
else
  "preview.#{brain_domain}"
end

github_env = ENV["GITHUB_ENV"]
raise "Missing GITHUB_ENV" if github_env.nil? || github_env.empty?

instance_name = ENV["INSTANCE_NAME"]
if instance_name.nil? || instance_name.empty?
  instance_name = File.basename(Dir.pwd)
end

registry_username = ENV["GITHUB_REPOSITORY_OWNER"]
raise "Missing GITHUB_REPOSITORY_OWNER" if registry_username.nil? || registry_username.empty?

repository = ENV["GITHUB_REPOSITORY"]
raise "Missing GITHUB_REPOSITORY" if repository.nil? || repository.empty?
repository_name = repository.split("/", 2).last
raise "Missing repository name" if repository_name.nil? || repository_name.empty?

File.open(github_env, "a") do |file|
  file.puts("INSTANCE_NAME=#{instance_name}")
  file.puts("BRAIN_MODEL=#{brain_model}")
  file.puts("BRAIN_DOMAIN=#{brain_domain}")
  file.puts("PREVIEW_DOMAIN=#{preview_domain}")
  file.puts("IMAGE_REPOSITORY=ghcr.io/#{registry_username}/#{repository_name}")
  file.puts("REGISTRY_USERNAME=#{registry_username}")
end
`;

  writeScaffoldFile(
    join(dir, "scripts", "extract-brain-config.rb"),
    content,
    true,
    regen,
  );
}

function listEnvSchemaVariableNames(envSchema: string): string[] {
  const names = envSchema.match(/^([A-Z][A-Z0-9_]*)=/gm) ?? [];
  return names.map((line) => line.slice(0, -1));
}

function buildWorkflowSecretsEnvBlock(dir: string): string {
  const envSchema = readFileSync(join(dir, ".env.schema"), "utf-8");
  return listEnvSchemaVariableNames(envSchema)
    .map((name) => `          ${name}: \${{ secrets.${name} }}`)
    .join("\n");
}

function writePublishWorkflow(dir: string, regen = false): void {
  const content = `name: Publish Image

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  packages: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          ref: \${{ github.sha }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Extract image metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/\${{ github.repository_owner }}/\${{ github.event.repository.name }}
          tags: |
            type=raw,value=latest
            type=raw,value=\${{ github.sha }}

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: Build and push image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: deploy/Dockerfile
          target: standalone
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          labels: |
            \${{ steps.meta.outputs.labels }}
            service=brain
`;

  writeScaffoldFile(
    join(dir, ".github", "workflows", "publish-image.yml"),
    content,
    false,
    regen,
  );
}

const packageDeployTemplatesDir = resolvePackageDeployTemplatesDir();

function resolvePackageDeployTemplatesDir(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(currentDir, "..", "..", "templates", "deploy"),
    join(currentDir, "..", "templates", "deploy"),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, "Dockerfile"))) {
      return candidate;
    }
  }

  throw new Error("Missing package-local deploy templates for brain init");
}

function writeDeployDockerfile(dir: string, regen = false): void {
  const content = readFileSync(
    join(packageDeployTemplatesDir, "Dockerfile"),
    "utf-8",
  );

  if (regen) {
    writeScaffoldFile(join(dir, "deploy", "Dockerfile"), content, false, true);
    return;
  }

  writeReconcilableScaffoldFile({
    path: join(dir, "deploy", "Dockerfile"),
    content,
    legacyContents: legacyDockerfileContents,
  });
}

function writeDeployWorkflow(dir: string, regen = false): void {
  const workflowSecretsEnv = buildWorkflowSecretsEnvBlock(dir);
  const content = `name: Deploy

on:
  workflow_run:
    workflows: ["Publish Image"]
    branches: ["main"]
    types: [completed]
  workflow_dispatch:

jobs:
  deploy:
    if: |
      github.event_name == 'workflow_dispatch' ||
      github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ github.event.workflow_run.head_sha || github.sha }}

      - name: Extract config from brain.yaml
        run: ./scripts/extract-brain-config.rb
        env:
          INSTANCE_NAME: \${{ github.event.repository.name }}

      - name: Validate env via varlock
        env:
${workflowSecretsEnv}
        run: npx -y varlock load --path .env.schema --show-all

      - name: Load env via varlock
        env:
${workflowSecretsEnv}
        run: |
          npx -y varlock load --path .env.schema --format json --compact > /tmp/varlock-env.json
          node <<'NODE'
          import { appendFileSync, readFileSync } from "node:fs";
          const env = JSON.parse(readFileSync('/tmp/varlock-env.json', 'utf8'));
          const githubEnvPath = process.env.GITHUB_ENV;

          if (!githubEnvPath) {
            throw new Error('Missing GITHUB_ENV');
          }

          const newline = String.fromCharCode(10);
          const carriageReturn = String.fromCharCode(13);
          const lines = Object.entries(env).flatMap(([key, value]) => {
            if (value === null || value === undefined) {
              return [];
            }

            const text = String(value)
              .split(carriageReturn + newline)
              .join(newline);
            if (text.includes(newline)) {
              return [];
            }

            return [key + '=' + text];
          });

          appendFileSync(githubEnvPath, lines.join(newline) + newline);
          NODE

      - name: Write Kamal SSH key
        run: |
          node <<'NODE'
          import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
          const env = JSON.parse(readFileSync('/tmp/varlock-env.json', 'utf8'));
          const privateKey = env.KAMAL_SSH_PRIVATE_KEY;
          if (privateKey === null || privateKey === undefined) {
            throw new Error('Missing KAMAL_SSH_PRIVATE_KEY');
          }

          const newline = String.fromCharCode(10);
          const carriageReturn = String.fromCharCode(13);
          let privateKeyText = String(privateKey)
            .split(carriageReturn + newline)
            .join(newline)
            .split('\\n')
            .join(newline);
          if (!privateKeyText.endsWith(newline)) {
            privateKeyText += newline;
          }

          const sshDir = process.env.HOME + '/.ssh';
          mkdirSync(sshDir, { recursive: true });
          writeFileSync(sshDir + '/id_ed25519', privateKeyText, {
            encoding: 'utf8',
            mode: 0o600,
          });
          NODE

      - name: Configure SSH client
        run: |
          mkdir -p ~/.ssh
          cat > ~/.ssh/config <<'EOF'
          Host *
            IdentityFile ~/.ssh/id_ed25519
            IdentitiesOnly yes
            BatchMode yes
            ConnectTimeout 5
            StrictHostKeyChecking no
            UserKnownHostsFile /dev/null
          EOF
          chmod 600 ~/.ssh/config

      - name: Write .kamal/secrets
        run: |
          mkdir -p .kamal
          node <<'NODE'
          import { readFileSync, writeFileSync } from "node:fs";
          const deployYaml = readFileSync('config/deploy.yml', 'utf8');
          const env = JSON.parse(readFileSync('/tmp/varlock-env.json', 'utf8'));
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
            const escaped = text.replace(/'/g, "\\'");
            lines.push(name + "='" + escaped + "'");
          }

          writeFileSync('.kamal/secrets', lines.join('\\n') + '\\n');
          NODE

      - name: Provision server
        id: provision
        env:
          HCLOUD_TOKEN: \${{ secrets.HCLOUD_TOKEN }}
          HCLOUD_SSH_KEY_NAME: \${{ secrets.HCLOUD_SSH_KEY_NAME }}
          HCLOUD_SERVER_TYPE: \${{ secrets.HCLOUD_SERVER_TYPE }}
          HCLOUD_LOCATION: \${{ secrets.HCLOUD_LOCATION }}
        run: bun deploy/scripts/provision-server.ts

      - name: Update Cloudflare DNS
        env:
          CF_API_TOKEN: \${{ secrets.CF_API_TOKEN }}
          CF_ZONE_ID: \${{ secrets.CF_ZONE_ID }}
          SERVER_IP: \${{ steps.provision.outputs.server_ip }}
        run: |
          BRAIN_DOMAIN="$BRAIN_DOMAIN" bun deploy/scripts/update-dns.ts
          BRAIN_DOMAIN="$PREVIEW_DOMAIN" bun deploy/scripts/update-dns.ts

      - name: Install Kamal
        run: |
          gem install --user-install kamal
          ruby -r rubygems -e 'puts Gem.user_dir + "/bin"' >> "$GITHUB_PATH"

      - name: Validate SSH key
        run: ssh-keygen -y -f ~/.ssh/id_ed25519 >/dev/null

      - name: Wait for SSH access
        env:
          SERVER_IP: \${{ steps.provision.outputs.server_ip }}
        run: |
          SSH_USER="$(ruby -e 'require "yaml"; config = YAML.load_file("config/deploy.yml") || {}; puts(config.dig("ssh", "user") || "root")')"
          for attempt in $(seq 1 18); do
            if ssh "$SSH_USER@$SERVER_IP" true >/dev/null 2>&1; then
              exit 0
            fi
            echo "SSH not ready yet (attempt $attempt/18); retrying in 5s..."
            sleep 5
          done
          echo "SSH never became ready for $SSH_USER@$SERVER_IP; last attempt output:" >&2
          ssh "$SSH_USER@$SERVER_IP" true >&2 || true
          exit 1

      - name: Deploy
        env:
          SERVER_IP: \${{ steps.provision.outputs.server_ip }}
          VERSION: \${{ github.event.workflow_run.head_sha || github.sha }}
          PREVIEW_DOMAIN: \${{ env.PREVIEW_DOMAIN }}
        run: kamal setup --skip-push

      - name: Verify origin TLS
        env:
          SERVER_IP: \${{ steps.provision.outputs.server_ip }}
        run: |
          curl -I -k --max-time 20 --resolve "$BRAIN_DOMAIN:443:$SERVER_IP" "https://$BRAIN_DOMAIN"
          curl -I -k --max-time 20 --resolve "$PREVIEW_DOMAIN:443:$SERVER_IP" "https://$PREVIEW_DOMAIN"

      - name: Dump remote proxy diagnostics
        if: failure()
        env:
          SERVER_IP: \${{ steps.provision.outputs.server_ip }}
        run: |
          SSH_USER="$(ruby -e 'require "yaml"; config = YAML.load_file("config/deploy.yml") || {}; puts(config.dig("ssh", "user") || "root")')"
          ssh "$SSH_USER@$SERVER_IP" '
            docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
            echo "--- kamal-proxy logs ---"
            docker logs kamal-proxy --tail 200 || true
            echo "--- kamal-proxy inspect ---"
            docker inspect kamal-proxy || true
          '
`;

  if (regen) {
    writeScaffoldFile(
      join(dir, ".github", "workflows", "deploy.yml"),
      content,
      false,
      true,
    );
    return;
  }

  writeReconcilableScaffoldFile({
    path: join(dir, ".github", "workflows", "deploy.yml"),
    content,
    legacyContents: legacyDeployWorkflowContents,
    shouldReconcile: (current) =>
      current.includes("name: Deploy") &&
      current.includes("run: kamal deploy --skip-push") &&
      current.includes("SERVER_IP: ${{ secrets.SERVER_IP }}") &&
      !current.includes('workflows: ["Publish Image"]'),
  });
}

const SHARED_DEPLOY_SCRIPTS = [
  "provision-server.ts",
  "update-dns.ts",
  "write-ssh-key.ts",
];

const DEPLOY_HELPERS_SHIM = `export {
  readJsonResponse,
  parseEnvFile,
  parseEnvSchema,
  parseEnvSchemaFile,
  requireEnv,
  writeGitHubOutput,
  writeGitHubEnv,
} from "@rizom/brain/deploy";
export type { EnvSchemaEntry } from "@rizom/brain/deploy";
`;

function normalizeStandaloneDeployYmlForComparison(content: string): string {
  return content.replace(
    /\n {2}secret:\n(?: {4}- .*\n)+\nvolumes:\n/,
    "\n  secret:\n    - __DYNAMIC_SECRETS__\n\nvolumes:\n",
  );
}

function matchesLegacyStandaloneDeployYml(current: string): boolean {
  const normalized = normalizeStandaloneDeployYmlForComparison(current);

  return [
    `service: brain
image: <%= ENV['IMAGE_REPOSITORY'] %>

servers:
  web:
    hosts:
      - <%= ENV['SERVER_IP'] %>

proxy:
  ssl:
    certificate_pem: CERTIFICATE_PEM
    private_key_pem: PRIVATE_KEY_PEM
  hosts:
    - <%= ENV['BRAIN_DOMAIN'] %>
    - <%= ENV['PREVIEW_DOMAIN'] %>
  app_port: 80
  healthcheck:
    path: /health

registry:
  server: ghcr.io
  username: <%= ENV['REGISTRY_USERNAME'] %>
  password:
    - KAMAL_REGISTRY_PASSWORD

builder:
  arch: amd64

env:
  clear:
    NODE_ENV: production
  secret:
    - __DYNAMIC_SECRETS__

volumes:
  - /opt/brain-data:/app/brain-data
  - /opt/brain.yaml:/app/brain.yaml
`,
    `service: brain
image: <%= ENV['IMAGE_REPOSITORY'] %>

servers:
  web:
    hosts:
      - <%= ENV['SERVER_IP'] %>

proxy:
  ssl:
    certificate_pem: CERTIFICATE_PEM
    private_key_pem: PRIVATE_KEY_PEM
  hosts:
    - <%= ENV['BRAIN_DOMAIN'] %>
    - preview.<%= ENV['BRAIN_DOMAIN'] %>
  app_port: 80
  healthcheck:
    path: /health

registry:
  server: ghcr.io
  username: <%= ENV['REGISTRY_USERNAME'] %>
  password:
    - KAMAL_REGISTRY_PASSWORD

builder:
  arch: amd64

env:
  clear:
    NODE_ENV: production
  secret:
    - __DYNAMIC_SECRETS__

volumes:
  - /opt/brain-data:/app/brain-data
  - /opt/brain.yaml:/app/brain.yaml
`,
  ].includes(normalized);
}

function removeLegacyGeneratedFile(
  path: string,
  legacyContents: string[],
): void {
  if (!existsSync(path)) {
    return;
  }

  const current = readFileSync(path, "utf-8");
  if (!legacyContents.includes(current)) {
    return;
  }

  unlinkSync(path);
}

function writeSharedDeployScripts(dir: string, regen = false): void {
  const scriptsDir = join(packageDeployTemplatesDir, "scripts");

  writeScaffoldFile(
    join(dir, "deploy", "scripts", "helpers.ts"),
    DEPLOY_HELPERS_SHIM,
    false,
    regen,
  );

  for (const script of SHARED_DEPLOY_SCRIPTS) {
    const content = readFileSync(join(scriptsDir, script), "utf-8");
    writeScaffoldFile(
      join(dir, "deploy", "scripts", script),
      content,
      false,
      regen,
    );
  }
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
 * This file layers on top of the active base theme automatically. Keep
 * shared theme structure in the base theme; put instance-local visual
 * overrides here.
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
  const siteAuthoringLines = shouldScaffoldLocalSiteTheme(model)
    ? "- `src/site.ts` — local site scaffold built on `@rizom/brain/site`\n- `src/theme.css` — local theme scaffold\n"
    : "";
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
${siteAuthoringLines}
This brain runs the **${model}** model. Edit \`brain.yaml\` to customize
plugins, change presets, or wire up integrations like Discord and MCP.
`;

  writeScaffoldFile(join(dir, "README.md"), content);
}

// Bun walks up from cwd looking for tsconfig.json to pick a JSX runtime.
// Keep instance apps on the published @rizom/brain preset, but also repeat
// the JSX hints locally because Bun's runtime transpiler needs them directly
// when loading app-local TSX files.
function writeTsConfig(dir: string): void {
  const content = `{
  "extends": "@rizom/brain/tsconfig.instance.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact"
  }
}
`;

  writeScaffoldFile(join(dir, "tsconfig.json"), content);
}
