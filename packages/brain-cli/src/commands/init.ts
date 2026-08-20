import {
  mkdirSync,
  writeFileSync,
  chmodSync,
  existsSync,
  readFileSync,
  cpSync,
} from "fs";
import { basename, dirname, join, resolve as pathResolve } from "path";
import { fileURLToPath } from "url";
import { stringify } from "yaml";
import pkg from "../../package.json" with { type: "json" };
import sitePkg from "../../../site/package.json" with { type: "json" };
import {
  isStaleDeployDockerfile,
  isStaleDeployScript,
  legacyStandaloneDeployYmlContents,
  matchesLegacyStandaloneDeployYml,
  renderDeployWorkflow,
  renderDockerfile,
  renderExtractBrainConfigScript,
  renderKamalDeploy,
  renderPreDeployHook,
  renderPublishImageWorkflow,
  type DeployScriptName,
} from "@brains/deploy-support";
import { parseEnvSchema } from "@brains/deploy-support";
import { parseBrainYaml } from "../lib/brain-yaml";
import {
  BITWARDEN_BOOTSTRAP_TOKEN_NAMES,
  buildInstanceEnvSchema,
  hasBitwardenPlugin,
} from "../lib/env-schema";
import { expandBrainRecipe, type BrainRecipeName } from "../lib/brain-recipes";

/**
 * Pinned versions written into scaffolded package.json files.
 *
 * `@rizom/brain` is pinned to the same version as the CLI doing the
 * scaffolding — a brain instance is always paired with the framework
 * version it was generated from. `@rizom/site` is independently versioned
 * and pinned exactly to the SDK compiled with this CLI. React and React DOM
 * remain on the matching JSX and server-renderer range.
 */
const RIZOM_BRAIN_VERSION = `^${pkg.version}`;
const RIZOM_SITE_VERSION = sitePkg.version;
const REACT_VERSION = "^19.2.7";

export interface ScaffoldOptions {
  recipe: BrainRecipeName;
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
 * canonical source of truth for selection/domain.
 *
 * The scaffolded shape is a real package: it has its own `package.json`
 * with `@rizom/brain`, React, and React DOM as deps so `bun install && bunx brain
 * start` works from the new dir. Recipes with an active website surface
 * also ship local `src/site.tsx` and `src/theme.css` convention files as
 * editable starting points while `brain.yaml` stays pinned to the recipe's
 * built-in site. The local theme scaffold layers on top of the active
 * base theme automatically; the local site scaffold activates when the
 * operator switches `brain.yaml` to the local site convention.
 *
 * The `tsconfig.json` extends the public `@rizom/brain` instance config
 * so standalone apps share the same JSX/runtime authoring contract.
 */
export function scaffold(dir: string, options: ScaffoldOptions): void {
  const existing = existsSync(join(dir, "brain.yaml"))
    ? parseBrainYaml(dir)
    : undefined;
  const recipe = options.recipe;
  const domain =
    existing?.domain ??
    options.domain ??
    `${basename(pathResolve(dir))}.rizom.ai`;

  writeBrainYaml(dir, recipe, domain, options.contentRepo);
  writeRecipeSeedContent(dir, recipe);
  writePackageJson(dir);
  writeReadme(dir, recipe);
  writeEnvExample(dir);
  writeGitignore(dir);
  writeTsConfig(dir);
  if (shouldScaffoldLocalSiteTheme(recipe)) {
    writeSiteSource(dir);
    writeThemeCss(dir);
  }
  writeEnvSchema(dir, options.backend);

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
  legacyContents?: readonly string[];
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

function shouldScaffoldLocalSiteTheme(recipe: BrainRecipeName): boolean {
  return recipe !== "minimal";
}

function writeBrainYaml(
  dir: string,
  recipe: BrainRecipeName,
  domain: string,
  contentRepo?: string,
): void {
  const expansion = expandBrainRecipe(recipe);
  const plugins: Record<string, Record<string, unknown>> = {
    ...(expansion.plugins ?? {}),
  };

  if (recipe === "personal") {
    plugins["auth-service"] = { setupEmail: "${SETUP_EMAIL_TO}" };
    plugins["notifications"] = {
      defaultRecipient: { type: "email", address: "${SETUP_EMAIL_TO}" },
    };
    plugins["email"] = {
      transport: "resend",
      apiKey: "${SETUP_EMAIL_API_KEY}",
      from: "${SETUP_EMAIL_FROM}",
    };
  }

  if (contentRepo) {
    plugins["directory-sync"] = {
      ...(plugins["directory-sync"] ?? {}),
      git: {
        repo: contentRepo.replace("github:", ""),
        authToken: "${GIT_SYNC_TOKEN}",
      },
    };
  }

  const content = stringify(
    {
      brain: "brain",
      ...(expansion.anchor ? { anchor: expansion.anchor } : {}),
      ...(expansion.kind ? { kind: expansion.kind } : {}),
      domain,
      bundles: expansion.bundles,
      ...(expansion.add ? { add: expansion.add } : {}),
      ...(expansion.remove ? { remove: expansion.remove } : {}),
      ...(expansion.site ? { site: expansion.site } : {}),
      admins: [],
      anchors: [],
      plugins,
    },
    { lineWidth: 0 },
  );

  writeScaffoldFile(join(dir, "brain.yaml"), content);
}

function writeRecipeSeedContent(dir: string, recipe: BrainRecipeName): void {
  const destination = join(dir, "seed-content");
  if (existsSync(destination)) return;

  const currentDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(
      currentDir,
      "..",
      "..",
      "templates",
      "recipes",
      recipe,
      "seed-content",
    ),
    join(currentDir, "..", "templates", "recipes", recipe, "seed-content"),
  ];
  const source = candidates.find((candidate) => existsSync(candidate));
  if (!source) {
    throw new Error(`Missing seed template for recipe "${recipe}"`);
  }
  cpSync(source, destination, { recursive: true, errorOnExist: true });
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

# Optional deprecated static fallback for MCP HTTP clients that cannot use OAuth/passkeys
MCP_AUTH_TOKEN=

# Optional
DISCORD_BOT_TOKEN=
SETUP_EMAIL_TO=
SETUP_EMAIL_API_KEY=
SETUP_EMAIL_FROM=

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

function writeEnvSchema(dir: string, backend?: string): void {
  const instanceName = basename(pathResolve(dir));
  writeScaffoldFile(
    join(dir, ".env.schema"),
    buildInstanceEnvSchema("brain", instanceName, backend),
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
    shouldReconcile: isStaleDeployDockerfile,
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

const SHARED_DEPLOY_SCRIPTS: readonly DeployScriptName[] = [
  "install-health-watchdog.ts",
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

  writeReconcilableScaffoldFile({
    path: join(dir, "deploy", "scripts", "helpers.ts"),
    content: DEPLOY_HELPERS_SHIM,
    shouldReconcile: (current) => current.includes('"@rizom/brain/deploy"'),
    regen,
  });

  for (const script of SHARED_DEPLOY_SCRIPTS) {
    const content = readFileSync(join(scriptsDir, script), "utf-8");
    writeReconcilableScaffoldFile({
      path: join(dir, "deploy", "scripts", script),
      content,
      shouldReconcile: (current) =>
        isStaleDeployScript(script, current, content),
      regen,
    });
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
      "@rizom/site": RIZOM_SITE_VERSION,
      react: REACT_VERSION,
      "react-dom": REACT_VERSION,
    },
    devDependencies: {
      "@types/react": "^19.2.17",
      "@types/react-dom": "^19.0.3",
      typescript: "^7.0.2",
    },
  };

  writeScaffoldFile(
    join(dir, "package.json"),
    JSON.stringify(content, null, 2) + "\n",
  );
}

function writeSiteSource(dir: string): void {
  const content = `import { defineSection, defineSite, sectionGroup, z } from "@rizom/site";

const hero = defineSection(
  z.object({
    heading: z.string(),
    introduction: z.string(),
  }),
  ({ heading, introduction }) => (
    <section className="hero">
      <h1>{heading}</h1>
      <p>{introduction}</p>
    </section>
  ),
  { title: "Hero", description: "Site introduction." },
);

export default defineSite({
  layouts: {
    default: ({ title, sections }) => (
      <html lang="en">
        <head><title>{title}</title></head>
        <body><main>{sections}</main></body>
      </html>
    ),
  },
  routes: [
    {
      id: "home",
      path: "/",
      title: "Welcome",
      sections: [{ id: "hero", template: "home.hero" }],
      navigation: { show: true, label: "Home", priority: 10 },
    },
  ],
  sections: [sectionGroup("home", { hero })],
  content: {
    home: {
      hero: {
        heading: "Your site",
        introduction: "Start building with schema-first sections.",
      },
    },
  },
  entityDisplay: {},
  staticAssets: {
    "robots.txt": "User-agent: *\\nAllow: /\\n",
  },
});
`;

  writeScaffoldFile(join(dir, "src", "site.tsx"), content);
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
function writeReadme(dir: string, recipe: BrainRecipeName): void {
  const name = basename(dir);
  const siteAuthoringLines = shouldScaffoldLocalSiteTheme(recipe)
    ? "- `src/site.tsx` — local schema-first site scaffold built on `@rizom/site`\n- `src/theme.css` — local theme scaffold\n"
    : "";
  const content = `# ${name}

A personal brain instance powered by [\`@rizom/brain\`](https://github.com/rizom-ai/brains).

## Quick start

\`\`\`bash
bun install
bunx brain start
\`\`\`

## What's here

- \`brain.yaml\` — instance configuration (bundles, plugins, secrets, permissions)
- \`package.json\` — pins \`@rizom/brain\`, React, and React DOM for module resolution
- \`tsconfig.json\` — JSX runtime hint (React)
- \`.env\` — secrets (gitignored, copy from \`.env.example\`)
- \`brain-data/\` — content (created on first sync, gitignored by default)
- \`data/auth/\` — local OAuth/passkey auth state (created on first run, gitignored)
${siteAuthoringLines}
On first start, open the one-shot \`/setup\` URL in the logs and register a passkey.
Preserve \`data/auth/\` across deploys, but keep it separate from \`brain-data/\`.

This brain was scaffolded from the **${recipe}** recipe. Edit \`brain.yaml\`
to customize bundles or wire up integrations like Discord and MCP.
`;

  writeScaffoldFile(join(dir, "README.md"), content);
}

// Bun walks up from cwd looking for tsconfig.json to pick a JSX runtime.
// Keep instance apps on the published @rizom/brain base config, but also repeat
// the JSX hints locally because Bun's runtime transpiler needs them directly
// when loading app-local TSX files.
function writeTsConfig(dir: string): void {
  const content = `{
  "extends": "@rizom/brain/tsconfig.instance.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  }
}
`;

  writeScaffoldFile(join(dir, "tsconfig.json"), content);
}
