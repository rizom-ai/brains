import { fileURLToPath } from "node:url";

import { findAllUsers, runUsers, type UserRunner } from "./reconcile-lib";

export async function reconcileAll(
  rootDir: string,
  runner?: UserRunner,
): Promise<void> {
  const users = await findAllUsers(rootDir);
  await runUsers(rootDir, users, runner);
}

async function main(): Promise<void> {
  const rootDir = process.argv[2] ?? process.cwd();
  await reconcileAll(rootDir);
}

const entrypointPath = process.argv[1];
if (entrypointPath && fileURLToPath(import.meta.url) === entrypointPath) {
  await main();
}
