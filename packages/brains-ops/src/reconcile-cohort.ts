import { fileURLToPath } from "node:url";

import { findCohortUsers, runUsers, type UserRunner } from "./reconcile-lib";

export async function reconcileCohort(
  rootDir: string,
  cohortId: string,
  runner?: UserRunner,
): Promise<void> {
  const users = await findCohortUsers(rootDir, cohortId);
  await runUsers(rootDir, users, runner);
}

async function main(): Promise<void> {
  const rootDir = process.argv[2] ?? process.cwd();
  const cohortId = process.argv[3];

  if (!cohortId) {
    throw new Error("Usage: reconcile-cohort <rootDir> <cohort>");
  }

  await reconcileCohort(rootDir, cohortId);
}

const entrypointPath = process.argv[1];
if (entrypointPath && fileURLToPath(import.meta.url) === entrypointPath) {
  await main();
}
