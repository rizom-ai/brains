import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  loadPilotRegistry,
  type PilotRegistry,
  type ResolvedUser,
} from "./load-registry";
import { writeUsersTable } from "./render-users-table";

export interface UserRunResult {
  brainYaml?: string;
}

export type UserRunner = (user: ResolvedUser) => Promise<UserRunResult | void>;

export async function runUsers(
  rootDir: string,
  registry: PilotRegistry,
  users: ResolvedUser[],
  runner: UserRunner = async () => {},
): Promise<void> {
  const snapshotWritten = new Set<string>();

  for (const user of users) {
    const result = await runner(user);

    if (result?.brainYaml) {
      await writeUserSnapshot(rootDir, user.handle, result.brainYaml);
      snapshotWritten.add(user.handle);
    }
  }

  const refreshedRegistry: PilotRegistry =
    snapshotWritten.size === 0
      ? registry
      : {
          ...registry,
          users: registry.users.map((entry) =>
            snapshotWritten.has(entry.handle)
              ? { ...entry, snapshotStatus: "present" as const }
              : entry,
          ),
        };

  await writeUsersTable(rootDir, { registry: refreshedRegistry });
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
): Promise<{ registry: PilotRegistry; user: ResolvedUser }> {
  const registry = await loadPilotRegistry(rootDir);
  const user = registry.users.find((entry) => entry.handle === handle);

  if (!user) {
    throw new Error(`Unknown user handle: ${handle}`);
  }

  return { registry, user };
}

export async function findCohortUsers(
  rootDir: string,
  cohortId: string,
): Promise<{ registry: PilotRegistry; users: ResolvedUser[] }> {
  const registry = await loadPilotRegistry(rootDir);
  const cohort = registry.cohorts.find((entry) => entry.id === cohortId);

  if (!cohort) {
    throw new Error(`Unknown cohort: ${cohortId}`);
  }

  return {
    registry,
    users: registry.users.filter((user) => user.cohort === cohort.id),
  };
}

export async function findAllUsers(
  rootDir: string,
): Promise<{ registry: PilotRegistry; users: ResolvedUser[] }> {
  const registry = await loadPilotRegistry(rootDir);
  return { registry, users: registry.users };
}
