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
import type { UserRunResult, UserRunner } from "./user-runner";

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
    const defaultResult = await defaultRunner(user);
    const runnerResult = normalizeUserRunResult(
      runner ? await runner(user) : undefined,
    );
    const brainYaml = runnerResult.brainYaml ?? defaultResult.brainYaml;
    const envFile = runnerResult.envFile ?? defaultResult.envFile;
    const result: UserRunResult = {
      ...(brainYaml ? { brainYaml } : {}),
      ...(envFile ? { envFile } : {}),
    };

    if (result.envFile) {
      await writeUserEnvFile(rootDir, user.handle, result.envFile);
    }

    if (result.brainYaml) {
      await writeUserSnapshot(rootDir, user.handle, result.brainYaml);
      snapshotWritten.add(user.handle);
    }
  }

  const presentSnapshotStatus: SnapshotStatus = "present";
  const refreshedRegistry: PilotRegistry =
    snapshotWritten.size === 0
      ? registry
      : {
          ...registry,
          users: registry.users.map((entry) =>
            snapshotWritten.has(entry.handle)
              ? { ...entry, snapshotStatus: presentSnapshotStatus }
              : entry,
          ),
        };

  await writeUsersTable(rootDir, { registry: refreshedRegistry });
}

function normalizeUserRunResult(result: UserRunResult | void): UserRunResult {
  return result && typeof result === "object" ? result : {};
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

async function writeUserEnvFile(
  rootDir: string,
  handle: string,
  envFile: string,
): Promise<void> {
  const envPath = join(rootDir, "users", handle, ".env");
  await mkdir(dirname(envPath), { recursive: true });
  await writeFile(envPath, envFile);
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
