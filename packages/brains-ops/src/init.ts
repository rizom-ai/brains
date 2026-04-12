import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import packageJson from "../package.json";
import { writeUsersTable } from "./render-users-table";

const starterFilePaths = [
  "pilot.yaml",
  "package.json",
  "cohorts/cohort-1.yaml",
  "users/alice.yaml",
  ".github/workflows/build.yml",
  ".github/workflows/deploy.yml",
  ".github/workflows/reconcile.yml",
  "deploy/Dockerfile",
  "deploy/kamal/deploy.yml",
  ".kamal/hooks/pre-deploy",
  "docs/onboarding-checklist.md",
  "docs/operator-playbook.md",
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

  for (const relativePath of starterFilePaths) {
    const targetPath = join(rootDir, relativePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeStarterFileIfMissing(relativePath, targetPath);
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
