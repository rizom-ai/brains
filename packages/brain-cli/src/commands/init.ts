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
  writeEnvSchema(dir, model);

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
 * exists so `scaffold()` is idempotent across repeated runs.
 */
function writeScaffoldFile(
  path: string,
  content: string,
  executable = false,
): void {
  if (existsSync(path)) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
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

function writeEnvSchema(dir: string, model: string): void {
  const instanceName = basename(pathResolve(dir));
  writeScaffoldFile(
    join(dir, ".env.schema"),
    buildInstanceEnvSchema(model, instanceName),
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
          CERTIFICATE_PEM: \${{ secrets.CERTIFICATE_PEM }}
          PRIVATE_KEY_PEM: \${{ secrets.PRIVATE_KEY_PEM }}
          AI_API_KEY: \${{ secrets.AI_API_KEY }}
          GIT_SYNC_TOKEN: \${{ secrets.GIT_SYNC_TOKEN }}
          MCP_AUTH_TOKEN: \${{ secrets.MCP_AUTH_TOKEN }}
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
