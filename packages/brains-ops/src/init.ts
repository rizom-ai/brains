import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import packageJson from "../package.json";
import {
  isStaleDeployMounts,
  renderDockerfile,
  stripDeployVolumes,
  renderKamalDeploy,
  renderPreDeployHook,
} from "@brains/deploy-support";
import { writeUsersTable } from "./render-users-table";

const starterFilePaths = [
  "pilot.yaml",
  "package.json",
  ".env.schema",
  ".gitignore",
  "cohorts/cohort-1.yaml",
  "users/alice.yaml",
  ".github/workflows/build.yml",
  ".github/workflows/deploy.yml",
  ".github/workflows/reconcile.yml",
  "deploy/Dockerfile",
  "deploy/kamal/deploy.yml",
  "deploy/scripts/helpers.ts",
  "deploy/scripts/provision-server.ts",
  "deploy/scripts/update-dns.ts",
  "deploy/scripts/write-ssh-key.ts",
  "deploy/scripts/decrypt-user-secrets.ts",
  "deploy/scripts/validate-secrets.ts",
  "deploy/scripts/write-kamal-secrets.ts",
  "deploy/scripts/resolve-user-config.ts",
  "deploy/scripts/resolve-deploy-handles.ts",
  "deploy/scripts/sync-content-repo.ts",
  ".kamal/hooks/pre-deploy",
  "docs/onboarding-checklist.md",
  "docs/operator-playbook.md",
  "docs/user-onboarding.md",
  "README.md",
] as const;

const executableStarterFilePaths = new Set<string>([".kamal/hooks/pre-deploy"]);
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

const reconcilableStarterFiles: Partial<
  Record<(typeof starterFilePaths)[number], string[]>
> = {
  "deploy/kamal/deploy.yml": legacyDeployYmlContents,
};

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
  if (current.includes("ATPROTO_APP_PASSWORD")) return false;

  const normalizedCurrent = stripDeployVolumes(
    normalizePilotDeploySecretList(current),
  );
  const normalizedTemplate = stripDeployVolumes(
    normalizePilotDeploySecretList(renderKamalDeploy({ serviceName: "rover" })),
  );

  return normalizedCurrent === normalizedTemplate;
}

function isStalePilotEnvSchema(current: string, template: string): boolean {
  if (current.includes("ATPROTO_APP_PASSWORD")) return false;

  const legacyTemplate = template.replace(
    /\n# AT Protocol publishing\/discovery \(optional, per-user\)\n# Comes from the decrypted users\/<handle>\.secrets\.yaml\.age file when configured\.\n# @sensitive\nATPROTO_APP_PASSWORD=\n/,
    "\n",
  );

  return current === legacyTemplate;
}

function isStaleDecryptUserSecretsScript(
  current: string,
  template: string,
): boolean {
  if (current.includes("ATPROTO_APP_PASSWORD")) return false;

  const legacyTemplate = template.replace(
    'writeGitHubEnv("ATPROTO_APP_PASSWORD", secrets["atprotoAppPassword"] ?? "");\n',
    "",
  );

  return current === legacyTemplate;
}

function isStaleResolveDeployHandlesScript(current: string): boolean {
  return (
    current.includes('if (eventName !== "push") {') &&
    current.includes('const currentSha = requireEnv("GITHUB_SHA");')
  );
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

  const templateWrites = starterFilePaths.map(async (relativePath) => {
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
  relativePath: (typeof starterFilePaths)[number],
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

  const legacyContents = reconcilableStarterFiles[relativePath] ?? [];
  const matchesLegacyContent = legacyContents.includes(current);
  const matchesLegacyPredicate =
    (relativePath === ".env.schema" &&
      isStalePilotEnvSchema(current, content)) ||
    (relativePath === "deploy/kamal/deploy.yml" &&
      (isStalePilotDeployYml(current) || isStalePilotDeploySecrets(current))) ||
    (relativePath === "deploy/scripts/decrypt-user-secrets.ts" &&
      isStaleDecryptUserSecretsScript(current, content)) ||
    (relativePath === "deploy/scripts/resolve-deploy-handles.ts" &&
      isStaleResolveDeployHandlesScript(current));
  if (!matchesLegacyContent && !matchesLegacyPredicate) {
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
