import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { createDefaultUserRunner } from "./default-user-runner";
import {
  loadPilotRegistry,
  type PilotRegistry,
  type ResolvedUser,
  type SnapshotStatus,
} from "./load-registry";
import { writeUsersTable } from "./render-users-table";
import type { UserRunner } from "./user-runner";

export type { UserRunResult, UserRunner } from "./user-runner";

export async function runUsers(
  rootDir: string,
  registry: PilotRegistry,
  users: ResolvedUser[],
  runner?: UserRunner,
): Promise<void> {
  const snapshotWritten = new Set<string>();
  const defaultRunner = createDefaultUserRunner(registry.pilot.githubOrg);

  for (const user of users) {
    const runnerResult = (runner ? await runner(user) : undefined) ?? {};
    const defaultResult = await defaultRunner(user);
    const brainYaml = runnerResult.brainYaml ?? defaultResult.brainYaml;
    const envFile = runnerResult.envFile ?? defaultResult.envFile;

    if (envFile) {
      await writeUserFile(rootDir, user.handle, ".env", envFile);
    }

    if (brainYaml) {
      await writeUserFile(rootDir, user.handle, "brain.yaml", brainYaml);
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
              ? { ...entry, snapshotStatus: "present" as SnapshotStatus }
              : entry,
          ),
        };

  await writeUsersTable(rootDir, { registry: refreshedRegistry });
}

async function writeUserFile(
  rootDir: string,
  handle: string,
  fileName: string,
  content: string,
): Promise<void> {
  const filePath = join(rootDir, "users", handle, fileName);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
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
