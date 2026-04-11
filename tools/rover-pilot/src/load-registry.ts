import { access, readdir, readFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";

import type { z } from "zod";

import { parseYamlDocument } from "../../../shared/utils/src/yaml";

import {
  type CohortConfig,
  cohortSchema,
  type PilotConfig,
  pilotSchema,
  type PilotPreset,
  type UserConfig,
  userSchema,
} from "./schema";

export type ExternalStatus = "unknown" | "ready" | "failed";
export type SnapshotStatus = "present" | "missing";

export interface ObservedUserStatus {
  repoStatus?: ExternalStatus;
  deployStatus?: ExternalStatus;
  dnsStatus?: ExternalStatus;
  mcpStatus?: ExternalStatus;
}

export interface ResolvedCohort {
  id: string;
  members: string[];
  brainVersionOverride?: string;
  presetOverride?: PilotPreset;
}

export interface ResolvedUserIdentity {
  handle: string;
  cohort: string;
  brainVersion: string;
  model: "rover";
  preset: PilotPreset;
  domain: string;
  repo: string;
  contentRepo: string;
  discordEnabled: boolean;
  snapshotStatus: SnapshotStatus;
}

export interface ResolvedUser extends ResolvedUserIdentity {
  repoStatus: ExternalStatus;
  deployStatus: ExternalStatus;
  dnsStatus: ExternalStatus;
  mcpStatus: ExternalStatus;
}

export interface LoadPilotRegistryOptions {
  resolveStatus?: (
    user: ResolvedUserIdentity,
  ) => Promise<ObservedUserStatus | undefined>;
}

export interface PilotRegistry {
  pilot: PilotConfig;
  cohorts: ResolvedCohort[];
  users: ResolvedUser[];
}

class PilotRegistryError extends Error {}

interface LoadedUserFile {
  id: string;
  data: UserConfig;
}

interface LoadedCohortFile {
  id: string;
  data: CohortConfig;
}

export async function loadPilotRegistry(
  rootDir: string,
  options: LoadPilotRegistryOptions = {},
): Promise<PilotRegistry> {
  const pilot = await readYamlFile(join(rootDir, "pilot.yaml"), pilotSchema);
  const userFiles = await loadUserFiles(rootDir);
  const cohortFiles = await loadCohortFiles(rootDir);

  const cohortMembership = resolveMemberships(userFiles, cohortFiles);
  const cohorts = cohortFiles
    .map((cohortFile) => ({
      id: cohortFile.id,
      members: [...cohortFile.data.members].sort(),
      brainVersionOverride: cohortFile.data.brainVersionOverride,
      presetOverride: cohortFile.data.presetOverride,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const users: ResolvedUser[] = [];

  for (const userFile of userFiles) {
    const cohort = cohortMembership.get(userFile.data.handle);
    if (!cohort) {
      throw new PilotRegistryError(
        `User ${userFile.data.handle} must belong to exactly one cohort`,
      );
    }

    const identity: ResolvedUserIdentity = {
      handle: userFile.data.handle,
      cohort: cohort.id,
      brainVersion: cohort.data.brainVersionOverride ?? pilot.brainVersion,
      model: pilot.model,
      preset: cohort.data.presetOverride ?? pilot.preset,
      domain: `${userFile.data.handle}${pilot.domainSuffix}`,
      repo: `${pilot.repoPrefix}${userFile.data.handle}`,
      contentRepo: `${pilot.repoPrefix}${userFile.data.handle}${pilot.contentRepoSuffix}`,
      discordEnabled: userFile.data.discord.enabled,
      snapshotStatus: await resolveSnapshotStatus(
        rootDir,
        userFile.data.handle,
      ),
    };
    const observedStatus = await options.resolveStatus?.(identity);

    users.push({
      ...identity,
      repoStatus: observedStatus?.repoStatus ?? "unknown",
      deployStatus: observedStatus?.deployStatus ?? "unknown",
      dnsStatus: observedStatus?.dnsStatus ?? "unknown",
      mcpStatus: observedStatus?.mcpStatus ?? "unknown",
    });
  }

  users.sort((left, right) => left.handle.localeCompare(right.handle));

  return {
    pilot,
    cohorts,
    users,
  };
}

async function loadUserFiles(rootDir: string): Promise<LoadedUserFile[]> {
  const userDir = join(rootDir, "users");
  const userFiles = await listYamlFiles(userDir);
  const loaded: LoadedUserFile[] = [];

  for (const filePath of userFiles) {
    const id = stripYamlExtension(basename(filePath));
    const data = await readYamlFile(filePath, userSchema);
    const displayPath = normalizePath(relative(rootDir, filePath));

    if (data.handle !== id) {
      throw new PilotRegistryError(`${displayPath} must declare handle: ${id}`);
    }

    loaded.push({ id, data });
  }

  return loaded.sort((left, right) => left.id.localeCompare(right.id));
}

async function loadCohortFiles(rootDir: string): Promise<LoadedCohortFile[]> {
  const cohortDir = join(rootDir, "cohorts");
  const cohortFiles = await listYamlFiles(cohortDir);
  const loaded: LoadedCohortFile[] = [];

  for (const filePath of cohortFiles) {
    loaded.push({
      id: stripYamlExtension(basename(filePath)),
      data: await readYamlFile(filePath, cohortSchema),
    });
  }

  return loaded.sort((left, right) => left.id.localeCompare(right.id));
}

function resolveMemberships(
  userFiles: LoadedUserFile[],
  cohortFiles: LoadedCohortFile[],
): Map<string, LoadedCohortFile> {
  const usersByHandle = new Map(
    userFiles.map((userFile) => [userFile.data.handle, userFile]),
  );
  const membership = new Map<string, LoadedCohortFile>();

  for (const cohortFile of cohortFiles) {
    for (const member of cohortFile.data.members) {
      if (!usersByHandle.has(member)) {
        throw new PilotRegistryError(
          `Cohort ${cohortFile.id} references unknown user ${member}`,
        );
      }

      if (membership.has(member)) {
        throw new PilotRegistryError(
          `User ${member} must belong to exactly one cohort`,
        );
      }

      membership.set(member, cohortFile);
    }
  }

  for (const userFile of userFiles) {
    if (!membership.has(userFile.data.handle)) {
      throw new PilotRegistryError(
        `User ${userFile.data.handle} must belong to exactly one cohort`,
      );
    }
  }

  return membership;
}

async function resolveSnapshotStatus(
  rootDir: string,
  handle: string,
): Promise<SnapshotStatus> {
  const snapshotPath = join(rootDir, "users", handle, "brain.yaml");

  try {
    await access(snapshotPath);
    return "present";
  } catch {
    return "missing";
  }
}

async function listYamlFiles(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".yaml"))
    .map((entry) => join(dirPath, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

async function readYamlFile<T>(
  filePath: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const content = await readFile(filePath, "utf8");
  const result = parseYamlDocument(content, schema);

  if (!result.ok) {
    throw new PilotRegistryError(`${normalizePath(filePath)}: ${result.error}`);
  }

  return result.data;
}

function stripYamlExtension(fileName: string): string {
  return fileName.replace(/\.yaml$/, "");
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

export { PilotRegistryError };
