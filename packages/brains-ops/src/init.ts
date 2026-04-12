import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import packageJson from "../package.json";
import { writeUsersTable } from "./render-users-table";

const starterFilePaths = [
  "pilot.yaml",
  "package.json",
  ".env.schema",
  "cohorts/cohort-1.yaml",
  "users/alice.yaml",
  ".github/workflows/build.yml",
  ".github/workflows/deploy.yml",
  ".github/workflows/reconcile.yml",
  "deploy/Dockerfile",
  "deploy/kamal/deploy.yml",
  "deploy/scripts/resolve-user-config.ts",
  ".kamal/hooks/pre-deploy",
  "docs/onboarding-checklist.md",
  "docs/operator-playbook.md",
  "README.md",
] as const;

const sharedDeployScripts = [
  "deploy/scripts/helpers.ts",
  "deploy/scripts/provision-server.ts",
  "deploy/scripts/update-dns.ts",
  "deploy/scripts/write-ssh-key.ts",
  "deploy/scripts/write-kamal-secrets.ts",
  "deploy/scripts/validate-secrets.ts",
] as const;

const executableStarterFilePaths = new Set<string>([".kamal/hooks/pre-deploy"]);
const templateRootDir = fileURLToPath(
  new URL("../templates/rover-pilot/", import.meta.url),
);
const sharedDeployScriptsDir = fileURLToPath(
  new URL(import.meta.resolve("@brains/utils/deploy-scripts/helpers.ts")),
).replace(/helpers\.ts$/, "");

export async function initPilotRepo(rootDir: string): Promise<void> {
  await mkdir(rootDir, { recursive: true });

  const usersTablePath = join(rootDir, "views", "users.md");
  let usersTableExists = true;

  try {
    await access(usersTablePath);
  } catch {
    usersTableExists = false;
  }

  for (const relativePath of starterFilePaths) {
    const targetPath = join(rootDir, relativePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeStarterFileIfMissing(relativePath, targetPath);
  }

  for (const relativePath of sharedDeployScripts) {
    const targetPath = join(rootDir, relativePath);
    const sourcePath = join(
      sharedDeployScriptsDir,
      relativePath.replace("deploy/scripts/", ""),
    );
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFileIfMissing(sourcePath, targetPath);
  }

  if (!usersTableExists) {
    await writeUsersTable(rootDir);
  }
}

async function writeStarterFileIfMissing(
  relativePath: string,
  targetPath: string,
): Promise<void> {
  const templatePath = join(templateRootDir, relativePath);
  const templateContent = await readFile(templatePath, "utf8");
  const content = renderTemplate(templateContent);
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

async function writeFileIfMissing(
  sourcePath: string,
  targetPath: string,
): Promise<void> {
  const content = await readFile(sourcePath, "utf8");
  try {
    await writeFile(targetPath, content, { flag: "wx" });
  } catch (err: unknown) {
    if (isErrnoExceptionWithCode(err, "EEXIST")) return;
    throw err;
  }
}

function renderTemplate(templateContent: string): string {
  return templateContent.replaceAll(
    "__BRAINS_OPS_VERSION__",
    packageJson.version,
  );
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
