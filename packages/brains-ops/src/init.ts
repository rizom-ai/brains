import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import packageJson from "../package.json";
import {
  deployScriptNames,
  isStaleDeployDockerfile,
  isStaleDeployMounts,
  isStaleDeployScript,
  renderDockerfile,
  stripDeployVolumes,
  renderKamalDeploy,
  renderPreDeployHook,
  type DeployScriptName,
} from "@brains/deploy-support";
import { writeUsersTable } from "./render-users-table";

const starterFilePaths = [
  "pilot.yaml",
  "package.json",
  ".env.schema",
  ".gitignore",
  "cohorts/cohort-1.yaml",
  "users/alice.yaml",
  ".github/actions/varlock-env/action.yml",
  ".github/workflows/build.yml",
  ".github/workflows/deploy.yml",
  ".github/workflows/directory-sync-stress.yml",
  ".github/workflows/health-watchdog-smoke.yml",
  ".github/workflows/reconcile.yml",
  ".github/workflows/upgrade.yml",
  "deploy/Dockerfile",
  "deploy/kamal/deploy.yml",
  "deploy/scripts/helpers.ts",
  "deploy/scripts/install-health-watchdog.ts",
  "deploy/scripts/provision-server.ts",
  "deploy/scripts/update-dns.ts",
  "deploy/scripts/write-ssh-key.ts",
  "deploy/scripts/decrypt-user-secrets.ts",
  "deploy/scripts/validate-secrets.ts",
  "deploy/scripts/write-kamal-secrets.ts",
  "deploy/scripts/resolve-user-config.ts",
  "deploy/scripts/resolve-missing-images.ts",
  "deploy/scripts/resolve-deploy-handles.ts",
  "deploy/scripts/sync-content-repo.ts",
  ".kamal/hooks/pre-deploy",
  "docs/onboarding-checklist.md",
  "docs/canonical-crossover-record.md",
  "docs/operator-playbook.md",
  "docs/user-onboarding.md",
  "README.md",
] as const;

const executableStarterFilePaths = new Set<string>([".kamal/hooks/pre-deploy"]);

/**
 * Example/one-time content scaffolded for a brand-new repo only. An operator
 * who deletes these keeps them deleted — reruns (including `upgrade`) must
 * not resurrect them the way missing infrastructure files are restored.
 */
const firstRunOnlyStarterFilePaths = new Set<(typeof starterFilePaths)[number]>(
  [
    "cohorts/cohort-1.yaml",
    "users/alice.yaml",
    "docs/canonical-crossover-record.md",
  ],
);
const templateRootDir = fileURLToPath(
  new URL("../templates/rover-pilot/", import.meta.url),
);

const legacyDeployYmlContents = [
  `service: rover
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
    - AI_API_KEY
    - GIT_SYNC_TOKEN
    - DISCORD_BOT_TOKEN

volumes:
  - /opt/brain-data:/app/brain-data
  - /opt/brain.yaml:/app/brain.yaml
`,
];

type StarterFilePath = (typeof starterFilePaths)[number];
type StalenessCheck = (current: string, template: string) => boolean;

/**
 * Marks a committed ops-owned generated script as a prior vintage when it
 * still contains its fingerprint, mirroring the shared
 * deployScriptFingerprints in @brains/deploy-support.
 */
function hasOpsScriptFingerprint(fingerprint: string): StalenessCheck {
  return (current) => current.includes(fingerprint);
}

function sharedDeployScriptName(
  relativePath: StarterFilePath,
): DeployScriptName | undefined {
  return deployScriptNames.find(
    (script) => relativePath === `deploy/scripts/${script}`,
  );
}

function normalizePilotDeploySecretList(content: string): string {
  return content.replace(
    /\n {2}secret:\n(?: {4}- .*\n)+\nvolumes:\n/,
    "\n  secret:\n    - __DYNAMIC_SECRETS__\n\nvolumes:\n",
  );
}

function isStalePilotDeployYml(current: string): boolean {
  return isStaleDeployMounts(current, "rover", normalizePilotDeploySecretList);
}

function isStalePilotDeploySecrets(current: string): boolean {
  if (
    current.includes("DISCORD_APPLICATION_ID") &&
    current.includes("ATPROTO_APP_PASSWORD")
  ) {
    return false;
  }

  const normalizedCurrent = stripDeployVolumes(
    normalizePilotDeploySecretList(current),
  );
  const normalizedTemplate = stripDeployVolumes(
    normalizePilotDeploySecretList(renderKamalDeploy({ serviceName: "rover" })),
  );

  return normalizedCurrent === normalizedTemplate;
}

/**
 * A committed copy missing any subset of these optional blocks is a prior
 * vintage: stripping every block from both sides makes stale copies equal
 * to the template without enumerating removal combinations.
 */
const envSchemaOptionalBlocks = [
  /\n# Stored with the per-user Discord credentials and injected at deploy time\.\n# @sensitive\nDISCORD_PUBLIC_KEY=\n\n# @sensitive\nDISCORD_APPLICATION_ID=\n/,
  /\n# AT Protocol publishing\/discovery \(optional, per-user\)\n# Comes from the decrypted users\/<handle>\.secrets\.yaml\.age file when configured\.\n# @sensitive\nATPROTO_APP_PASSWORD=\n/,
];

function isStalePilotEnvSchema(current: string, template: string): boolean {
  const strip = (content: string): string =>
    envSchemaOptionalBlocks.reduce(
      (stripped, block) => stripped.replace(block, "\n"),
      content,
    );
  return strip(current) === strip(template);
}

const decryptUserSecretsOptionalSnippets = [
  'writeSecretGitHubEnv("DISCORD_PUBLIC_KEY", secrets["discordPublicKey"]);\nwriteSecretGitHubEnv("DISCORD_APPLICATION_ID", secrets["discordApplicationId"]);\n',
  'writeSecretGitHubEnv("ATPROTO_APP_PASSWORD", secrets["atprotoAppPassword"]);\n',
];

function isStaleDecryptUserSecretsScript(
  current: string,
  template: string,
): boolean {
  const strip = (content: string): string =>
    decryptUserSecretsOptionalSnippets.reduce(
      (stripped, snippet) => stripped.replace(snippet, ""),
      content,
    );
  return strip(current) === strip(template);
}

function isStaleResolveDeployHandlesScript(current: string): boolean {
  return (
    current.includes('if (eventName !== "push") {') &&
    current.includes('const currentSha = requireEnv("GITHUB_SHA");')
  );
}

/** Per-file detectors for committed copies of prior generated vintages. */
const stalenessChecks: Partial<Record<StarterFilePath, StalenessCheck>> = {
  ".env.schema": isStalePilotEnvSchema,
  "deploy/Dockerfile": (current) => isStaleDeployDockerfile(current),
  "deploy/kamal/deploy.yml": (current) =>
    legacyDeployYmlContents.includes(current) ||
    isStalePilotDeployYml(current) ||
    isStalePilotDeploySecrets(current),
  "deploy/scripts/decrypt-user-secrets.ts": isStaleDecryptUserSecretsScript,
  "deploy/scripts/resolve-deploy-handles.ts": (current) =>
    isStaleResolveDeployHandlesScript(current),
  "deploy/scripts/helpers.ts": hasOpsScriptFingerprint('"@rizom/ops/deploy"'),
  "deploy/scripts/resolve-user-config.ts":
    hasOpsScriptFingerprint("loadPilotRegistry"),
  "deploy/scripts/resolve-missing-images.ts": hasOpsScriptFingerprint(
    "runResolveMissingImages",
  ),
  "deploy/scripts/sync-content-repo.ts":
    hasOpsScriptFingerprint("GIT_SYNC_TOKEN"),
  // Tooling workflows must track the template. directory-sync-stress.yml and
  // health-watchdog-smoke.yml are deliberately absent: operators tune them
  // in-repo, and a reconcile must not revert that.
  ".github/workflows/build.yml": hasOpsScriptFingerprint(
    "resolve-missing-images.ts",
  ),
  ".github/workflows/deploy.yml": hasOpsScriptFingerprint(
    "install-health-watchdog.ts",
  ),
  ".github/workflows/reconcile.yml": hasOpsScriptFingerprint(
    "brains-ops reconcile",
  ),
  ".github/workflows/upgrade.yml":
    hasOpsScriptFingerprint("brains-ops upgrade"),
};

/** A stale committed copy of an earlier vintage gets rewritten on rerun. */
function isStaleVintage(
  relativePath: StarterFilePath,
  current: string,
  template: string,
): boolean {
  const sharedScript = sharedDeployScriptName(relativePath);
  if (sharedScript && isStaleDeployScript(sharedScript, current, template)) {
    return true;
  }
  return stalenessChecks[relativePath]?.(current, template) ?? false;
}

export async function initPilotRepo(rootDir: string): Promise<void> {
  await mkdir(rootDir, { recursive: true });

  const usersTablePath = join(rootDir, "views", "users.md");
  let usersTableExists = true;

  try {
    await access(usersTablePath);
  } catch {
    usersTableExists = false;
  }

  let isExistingRepo = true;
  try {
    await access(join(rootDir, "pilot.yaml"));
  } catch {
    isExistingRepo = false;
  }

  // Skipped example files must not skip their directories: the users table
  // and cohort loading expect these to exist even on an example-free repo.
  await mkdir(join(rootDir, "users"), { recursive: true });
  await mkdir(join(rootDir, "cohorts"), { recursive: true });

  const templateWrites = starterFilePaths
    .filter(
      (relativePath) =>
        !(isExistingRepo && firstRunOnlyStarterFilePaths.has(relativePath)),
    )
    .map(async (relativePath) => {
      const targetPath = join(rootDir, relativePath);
      await mkdir(dirname(targetPath), { recursive: true });
      await writeStarterFileIfMissing(relativePath, targetPath);
    });

  await Promise.all(templateWrites);

  if (!usersTableExists) {
    await writeUsersTable(rootDir);
  }
}

async function writeStarterFileIfMissing(
  relativePath: StarterFilePath,
  targetPath: string,
): Promise<void> {
  const content = await renderStarterFile(relativePath);
  try {
    await writeFile(targetPath, content, { flag: "wx" });
    if (executableStarterFilePaths.has(relativePath)) {
      await chmod(targetPath, 0o755);
    }
    return;
  } catch (err: unknown) {
    if (!isErrnoExceptionWithCode(err, "EEXIST")) {
      throw err;
    }
  }

  const current = await readFile(targetPath, "utf8");
  if (current === content) {
    if (executableStarterFilePaths.has(relativePath)) {
      await chmod(targetPath, 0o755);
    }
    return;
  }

  if (!isStaleVintage(relativePath, current, content)) {
    return;
  }

  await writeFile(targetPath, content);
  if (executableStarterFilePaths.has(relativePath)) {
    await chmod(targetPath, 0o755);
  }
}

async function renderStarterFile(relativePath: string): Promise<string> {
  if (relativePath === ".gitignore") {
    return "node_modules/\n.brains-ops/\nusers/*.secrets.yaml\n";
  }
  if (relativePath === "deploy/Dockerfile") {
    return renderDockerfile();
  }
  if (relativePath === "deploy/kamal/deploy.yml") {
    return renderKamalDeploy({ serviceName: "rover" });
  }
  if (relativePath === ".kamal/hooks/pre-deploy") {
    return renderPreDeployHook({
      deployConfigPath: "deploy/kamal/deploy.yml",
      brainYamlPath: "${BRAIN_YAML_PATH:-brain.yaml}",
    });
  }

  const templatePath = join(templateRootDir, relativePath);
  const templateContent = await readFile(templatePath, "utf8");
  return renderTemplate(templateContent);
}

function renderTemplate(templateContent: string): string {
  return templateContent
    .replaceAll("__BRAINS_OPS_VERSION__", packageJson.version)
    .replaceAll("__BUN_VERSION__", Bun.version);
}

function isErrnoExceptionWithCode(
  err: unknown,
  code: string,
): err is NodeJS.ErrnoException {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === code
  );
}
