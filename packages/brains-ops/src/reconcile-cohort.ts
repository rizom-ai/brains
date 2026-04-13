import {
  findCohortUsers,
  runUsers,
  type UserRunner,
  type ContentRepoSyncOptions,
} from "./reconcile-lib";

export async function reconcileCohort(
  rootDir: string,
  cohortId: string,
  runner?: UserRunner,
  contentRepoOptions: ContentRepoSyncOptions = {},
): Promise<void> {
  const { registry, users } = await findCohortUsers(rootDir, cohortId);
  await runUsers(rootDir, registry, users, runner, contentRepoOptions);
}
