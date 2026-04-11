import { fileURLToPath } from "node:url";

import { findUser, runUsers, type UserRunner } from "./reconcile-lib";

export async function onboardUser(
  rootDir: string,
  handle: string,
  runner?: UserRunner,
): Promise<void> {
  const user = await findUser(rootDir, handle);
  await runUsers(rootDir, [user], runner);
}

async function main(): Promise<void> {
  const rootDir = process.argv[2] ?? process.cwd();
  const handle = process.argv[3];

  if (!handle) {
    throw new Error("Usage: onboard-user <rootDir> <handle>");
  }

  await onboardUser(rootDir, handle);
}

const entrypointPath = process.argv[1];
if (entrypointPath && fileURLToPath(import.meta.url) === entrypointPath) {
  await main();
}
