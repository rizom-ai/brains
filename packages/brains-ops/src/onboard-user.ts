import {
  findUser,
  runUsers,
  type UserRunner,
  type ContentRepoSyncOptions,
} from "./reconcile-lib";

export async function onboardUser(
  rootDir: string,
  handle: string,
  runner?: UserRunner,
  contentRepoOptions: ContentRepoSyncOptions = {},
): Promise<void> {
  const { registry, user } = await findUser(rootDir, handle);
  await runUsers(rootDir, registry, [user], runner, contentRepoOptions);
}
