import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import packageJson from "../package.json";
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
  "deploy/Caddyfile",
  "deploy/kamal/deploy.yml",
  "deploy/scripts/helpers.ts",
  "deploy/scripts/provision-server.ts",
  "deploy/scripts/update-dns.ts",
  "deploy/scripts/write-ssh-key.ts",
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
  relativePath: string,
  targetPath: string,
): Promise<void> {
  const content = await renderStarterFile(relativePath);
  try {
    await writeFile(targetPath, content, { flag: "wx" });
  } catch (err: unknown) {
    if (isErrnoExceptionWithCode(err, "EEXIST")) {
      return;
    }
    throw err;
  }

  if (executableStarterFilePaths.has(relativePath)) {
    await chmod(targetPath, 0o755);
  }
}

async function renderStarterFile(relativePath: string): Promise<string> {
  if (relativePath === ".gitignore") {
    return "node_modules/\n.brains-ops/\n";
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
