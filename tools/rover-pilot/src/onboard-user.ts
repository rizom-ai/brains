import { findUser, runUsers, type UserRunner } from "./reconcile-lib";

export async function onboardUser(
  rootDir: string,
  handle: string,
  runner?: UserRunner,
): Promise<void> {
  const { registry, user } = await findUser(rootDir, handle);
  await runUsers(rootDir, registry, [user], runner);
}
