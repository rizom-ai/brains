import {
  findAllUsers,
  runUsers,
  type UserRunner,
  type ContentRepoSyncOptions,
} from "./reconcile-lib";

export async function reconcileAll(
  rootDir: string,
  runner?: UserRunner,
  contentRepoOptions: ContentRepoSyncOptions = {},
): Promise<void> {
  const { registry, users } = await findAllUsers(rootDir);
  await runUsers(rootDir, registry, users, runner, contentRepoOptions);
}
