import { findCohortUsers, runUsers, type UserRunner } from "./reconcile-lib";

export async function reconcileCohort(
  rootDir: string,
  cohortId: string,
  runner?: UserRunner,
): Promise<void> {
  const { registry, users } = await findCohortUsers(rootDir, cohortId);
  await runUsers(rootDir, registry, users, runner);
}
