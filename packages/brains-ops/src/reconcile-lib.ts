import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { loadPilotRegistry, type ResolvedUser } from "./load-registry";
import { writeUsersTable } from "./render-users-table";

export interface UserRunResult {
  brainYaml?: string;
}

export type UserRunner = (user: ResolvedUser) => Promise<UserRunResult | void>;

export async function runUsers(
  rootDir: string,
  users: ResolvedUser[],
  runner: UserRunner = async () => {},
): Promise<void> {
  for (const user of users) {
    const result = await runner(user);

    if (result?.brainYaml) {
      await writeUserSnapshot(rootDir, user.handle, result.brainYaml);
    }
  }

  await writeUsersTable(rootDir);
}

async function writeUserSnapshot(
  rootDir: string,
  handle: string,
  brainYaml: string,
): Promise<void> {
  const snapshotPath = join(rootDir, "users", handle, "brain.yaml");
  await mkdir(dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, brainYaml);
}

export async function findUser(
  rootDir: string,
  handle: string,
): Promise<ResolvedUser> {
  const registry = await loadPilotRegistry(rootDir);
  const user = registry.users.find((entry) => entry.handle === handle);

  if (!user) {
    throw new Error(`Unknown user handle: ${handle}`);
  }

  return user;
}

export async function findCohortUsers(
  rootDir: string,
  cohortId: string,
): Promise<ResolvedUser[]> {
  const registry = await loadPilotRegistry(rootDir);
  const cohort = registry.cohorts.find((entry) => entry.id === cohortId);

  if (!cohort) {
    throw new Error(`Unknown cohort: ${cohortId}`);
  }

  return registry.users.filter((user) => user.cohort === cohort.id);
}

export async function findAllUsers(rootDir: string): Promise<ResolvedUser[]> {
  const registry = await loadPilotRegistry(rootDir);
  return registry.users;
}
