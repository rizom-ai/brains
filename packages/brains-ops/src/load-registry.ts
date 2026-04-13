import { access, readdir, readFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";

import { parseYamlDocument, type ZodType } from "@brains/utils";

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
  serverStatus?: ExternalStatus;
  deployStatus?: ExternalStatus;
  dnsStatus?: ExternalStatus;
  mcpStatus?: ExternalStatus;
}

export interface ResolvedCohort {
  id: string;
  members: string[];
  brainVersionOverride?: string;
  presetOverride?: PilotPreset;
  aiApiKeyOverride?: string;
}

export interface ResolvedAnchorProfileSocialLink {
  platform: "github" | "instagram" | "linkedin" | "email" | "website";
  url: string;
  label?: string;
}

export interface ResolvedAnchorProfile {
  name: string;
  description?: string;
  website?: string;
  email?: string;
  story?: string;
  socialLinks?: ResolvedAnchorProfileSocialLink[];
}

export interface ResolvedUserIdentity {
  handle: string;
  cohort: string;
  brainVersion: string;
  model: "rover";
  preset: PilotPreset;
  domain: string;
  contentRepo: string;
  discordEnabled: boolean;
  discordAnchorUserId?: string;
  effectiveAiApiKey: string;
  anchorProfile: ResolvedAnchorProfile;
  snapshotStatus: SnapshotStatus;
}

export interface ResolvedUser extends ResolvedUserIdentity {
  serverStatus: ExternalStatus;
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
  const [pilot, userFiles, cohortFiles] = await Promise.all([
    readYamlFile(join(rootDir, "pilot.yaml"), pilotSchema),
    loadUserFiles(rootDir),
    loadCohortFiles(rootDir),
  ]);

  const cohortMembership = resolveMemberships(userFiles, cohortFiles);
  const cohorts = cohortFiles
    .map((cohortFile) => ({
      id: cohortFile.id,
      members: [...cohortFile.data.members].sort(),
      ...(cohortFile.data.brainVersionOverride
        ? { brainVersionOverride: cohortFile.data.brainVersionOverride }
        : {}),
      ...(cohortFile.data.presetOverride
        ? { presetOverride: cohortFile.data.presetOverride }
        : {}),
      ...(cohortFile.data.aiApiKeyOverride
        ? { aiApiKeyOverride: cohortFile.data.aiApiKeyOverride }
        : {}),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const users = await Promise.all(
    userFiles.map(async (userFile): Promise<ResolvedUser> => {
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
        contentRepo: `${pilot.contentRepoPrefix}${userFile.data.handle}-content`,
        discordEnabled: userFile.data.discord.enabled,
        ...(userFile.data.discord.anchorUserId
          ? { discordAnchorUserId: userFile.data.discord.anchorUserId }
          : {}),
        effectiveAiApiKey:
          userFile.data.aiApiKeyOverride ??
          cohort.data.aiApiKeyOverride ??
          pilot.aiApiKey,
        anchorProfile: resolveAnchorProfile(
          userFile.data.handle,
          userFile.data.anchorProfile,
        ),
        snapshotStatus: await resolveSnapshotStatus(
          rootDir,
          userFile.data.handle,
        ),
      };
      const observedStatus = await options.resolveStatus?.(identity);

      return {
        ...identity,
        serverStatus: observedStatus?.serverStatus ?? "unknown",
        deployStatus: observedStatus?.deployStatus ?? "unknown",
        dnsStatus: observedStatus?.dnsStatus ?? "unknown",
        mcpStatus: observedStatus?.mcpStatus ?? "unknown",
      };
    }),
  );

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

  const loaded = await Promise.all(
    userFiles.map(async (filePath): Promise<LoadedUserFile> => {
      const id = stripYamlExtension(basename(filePath));
      const data = await readYamlFile(filePath, userSchema);

      if (data.handle !== id) {
        const displayPath = normalizePath(relative(rootDir, filePath));
        throw new PilotRegistryError(
          `${displayPath} must declare handle: ${id}`,
        );
      }

      return { id, data };
    }),
  );

  return loaded.sort((left, right) => left.id.localeCompare(right.id));
}

async function loadCohortFiles(rootDir: string): Promise<LoadedCohortFile[]> {
  const cohortDir = join(rootDir, "cohorts");
  const cohortFiles = await listYamlFiles(cohortDir);

  const loaded = await Promise.all(
    cohortFiles.map(
      async (filePath): Promise<LoadedCohortFile> => ({
        id: stripYamlExtension(basename(filePath)),
        data: await readYamlFile(filePath, cohortSchema),
      }),
    ),
  );

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

function resolveAnchorProfile(
  handle: string,
  anchorProfile?: UserConfig["anchorProfile"],
): ResolvedAnchorProfile {
  return {
    name: anchorProfile?.name ?? handleToDisplayName(handle),
    ...(anchorProfile?.description
      ? { description: anchorProfile.description }
      : {}),
    ...(anchorProfile?.website ? { website: anchorProfile.website } : {}),
    ...(anchorProfile?.email ? { email: anchorProfile.email } : {}),
    ...(anchorProfile?.story ? { story: anchorProfile.story } : {}),
    ...(anchorProfile?.socialLinks
      ? {
          socialLinks: anchorProfile.socialLinks.map((link) => ({
            platform: link.platform,
            url: link.url,
            ...(link.label ? { label: link.label } : {}),
          })),
        }
      : {}),
  };
}

function handleToDisplayName(handle: string): string {
  return handle
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
  schema: ZodType<T>,
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
