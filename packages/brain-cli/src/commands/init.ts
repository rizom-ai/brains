import {
  mkdirSync,
  writeFileSync,
  chmodSync,
  existsSync,
  readFileSync,
} from "fs";
import { basename, dirname, join, resolve as pathResolve } from "path";
import { fileURLToPath } from "url";
import pkg from "../../package.json" with { type: "json" };
import {
  legacyStandaloneDeployYmlContents,
  matchesLegacyStandaloneDeployYml,
  renderDeployWorkflow,
  renderDockerfile,
  renderExtractBrainConfigScript,
  renderKamalDeploy,
  renderPreDeployHook,
  renderPublishImageWorkflow,
} from "@brains/deploy-templates";
import { parseEnvSchema } from "@brains/utils";
import { parseBrainYaml } from "../lib/brain-yaml";
import {
  BITWARDEN_BOOTSTRAP_TOKEN_NAMES,
  buildInstanceEnvSchema,
  hasBitwardenPlugin,
} from "../lib/env-schema";

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
  regen?: boolean;
}): void {
  const {
    path,
    content,
    executable = false,
    legacyContents = [],
    shouldReconcile,
    regen = false,
  } = options;
  mkdirSync(dirname(path), { recursive: true });

  if (regen) {
    writeFileSync(path, content);
    if (executable) {
      chmodSync(path, 0o755);
    }
    return;
  }

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

function writeDeployYml(dir: string, regen = false): void {
  const content = renderKamalDeploy({ serviceName: "brain" });

  writeReconcilableScaffoldFile({
    path: join(dir, "config", "deploy.yml"),
    content,
    legacyContents: legacyStandaloneDeployYmlContents,
    shouldReconcile: matchesLegacyStandaloneDeployYml,
    regen,
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
  writeScaffoldFile(
    join(dir, ".kamal", "hooks", "pre-deploy"),
    renderPreDeployHook(),
    true,
    regen,
  );
}
function writeExtractBrainConfigScript(dir: string, regen = false): void {
  writeScaffoldFile(
    join(dir, "scripts", "extract-brain-config.rb"),
    renderExtractBrainConfigScript(),
    true,
    regen,
  );
}
interface WorkflowSecrets {
  secretNames: string[];
  bootstrapSecrets: string[];
}

function resolveWorkflowSecrets(dir: string): WorkflowSecrets {
  const envSchema = readFileSync(join(dir, ".env.schema"), "utf-8");
  const envNames = parseEnvSchema(envSchema).map((entry) => entry.key);
  if (hasBitwardenPlugin(envSchema)) {
    const bootstrap = envNames.filter((name) =>
      BITWARDEN_BOOTSTRAP_TOKEN_NAMES.has(name),
    );
    if (bootstrap.length > 0) {
      return { secretNames: bootstrap, bootstrapSecrets: bootstrap };
    }
  }
  return { secretNames: envNames, bootstrapSecrets: [] };
}

function writePublishWorkflow(dir: string, regen = false): void {
  writeReconcilableScaffoldFile({
    path: join(dir, ".github", "workflows", "publish-image.yml"),
    content: renderPublishImageWorkflow(),
    regen,
  });
}

const packageDeployScriptsDir = resolvePackageDeployScriptsDir();

function resolvePackageDeployScriptsDir(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(currentDir, "..", "..", "templates", "deploy", "scripts"),
    join(currentDir, "..", "templates", "deploy", "scripts"),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, "provision-server.ts"))) {
      return candidate;
    }
  }

  throw new Error("Missing package-local deploy scripts for brain init");
}

function writeDeployDockerfile(dir: string, regen = false): void {
  const content = renderDockerfile();

  writeReconcilableScaffoldFile({
    path: join(dir, "deploy", "Dockerfile"),
    content,
    regen,
  });
}

function writeDeployWorkflow(dir: string, regen = false): void {
  writeReconcilableScaffoldFile({
    path: join(dir, ".github", "workflows", "deploy.yml"),
    content: renderDeployWorkflow(resolveWorkflowSecrets(dir)),
    regen,
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

function writeSharedDeployScripts(dir: string, regen = false): void {
  const scriptsDir = packageDeployScriptsDir;

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
!.env.schema
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
