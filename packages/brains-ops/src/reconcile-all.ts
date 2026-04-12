import { findAllUsers, runUsers, type UserRunner } from "./reconcile-lib";

export async function reconcileAll(
  rootDir: string,
  runner?: UserRunner,
): Promise<void> {
  const { registry, users } = await findAllUsers(rootDir);
  await runUsers(rootDir, registry, users, runner);
}
