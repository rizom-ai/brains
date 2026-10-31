import { access, readdir, readFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";

import { definedFields } from "@brains/utils/strip-undefined";
import {
  parseYamlDocument,
  type YamlValidationSchema,
} from "@brains/utils/yaml";

import {
  type AnchorKind,
  type CohortConfig,
  cohortSchema,
  type PilotConfig,
  pilotSchema,
  type CanonicalBundleId,
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
  bundlesOverride?: CanonicalBundleId[];
  addOverride?: string[];
  removeOverride?: string[];
  aiApiKeyOverride?: string;
  gitSyncTokenOverride?: string;
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

export interface ResolvedSetupDelivery {
  delivery: "email";
  email: string;
}

export interface ResolvedAtprotoJetstreamConfig {
  enabled?: boolean | undefined;
  endpoint?: string | undefined;
  replayWindowSeconds?: number | undefined;
  denyDids?: string[] | undefined;
  denyDomains?: string[] | undefined;
  skillKeywords?: string[] | undefined;
  queueLimit?: number | undefined;
  concurrency?: number | undefined;
  perDidCooldownSeconds?: number | undefined;
  fetchBudgetPerMinute?: number | undefined;
  newAgentsPerHour?: number | undefined;
  pendingCandidateCeiling?: number | undefined;
  staleCandidateRetentionDays?: number | undefined;
  requestTimeoutMs?: number | undefined;
  maxResponseBytes?: number | undefined;
  maxRedirects?: number | undefined;
  retryAttempts?: number | undefined;
  heartbeatIntervalHours?: number | undefined;
}

export interface ResolvedAtprotoConfig {
  identifier: string;
  /** Owner account DID served at /.well-known/atproto-did for handle verification. */
  accountDid?: string | undefined;
  /** Whether this account publishes the canonical ai.rizom.brain.* schemas. */
  lexiconAuthority?: boolean | undefined;
  /** Per-brain bounded Jetstream canary configuration. */
  jetstream?: ResolvedAtprotoJetstreamConfig | undefined;
}

export interface ResolvedPlaybooksConfig {
  onboarding?: boolean | undefined;
}

export interface ResolvedSiteOverride {
  package: string;
  version?: string | undefined;
  theme?: string | undefined;
  themeVersion?: string | undefined;
}

export interface ResolvedUserIdentity {
  handle: string;
  cohort: string;
  brainVersion: string;
  bundleContract: PilotConfig["bundleContract"];
  bundles: CanonicalBundleId[];
  add: string[];
  remove: string[];
  domain: string;
  cloudflareZoneId?: string | undefined;
  contentRepo: string;
  profileKind?: string | undefined;
  anchorKind?: AnchorKind | undefined;
  embeddingEnabled?: boolean | undefined;
  embeddingModel?: string | undefined;
  plugins?: UserConfig["plugins"];
  spaces?: string[] | undefined;
  topicExtractionEnabled?: boolean | undefined;
  skillDerivationEnabled?: boolean | undefined;
  swotDerivationEnabled?: boolean | undefined;
  siteOverride?: ResolvedSiteOverride;
  discordEnabled: boolean;
  discordAnchorUserId?: string;
  effectiveAiApiKey: string;
  effectiveGitSyncToken: string;
  setup?: ResolvedSetupDelivery;
  atproto?: ResolvedAtprotoConfig;
  playbooks?: ResolvedPlaybooksConfig;
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

export interface LoadedCohortFile {
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
    .map((cohortFile): ResolvedCohort => ({
      id: cohortFile.id,
      members: [...cohortFile.data.members].sort(),
      ...definedFields({
        brainVersionOverride: cohortFile.data.brainVersionOverride,
        bundlesOverride: cohortFile.data.bundlesOverride,
        addOverride: cohortFile.data.addOverride,
        removeOverride: cohortFile.data.removeOverride,
        aiApiKeyOverride: cohortFile.data.aiApiKeyOverride,
        gitSyncTokenOverride: cohortFile.data.gitSyncTokenOverride,
      }),
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
        ...resolveUserIdentity(userFile.data, cohort, pilot),
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

/**
 * Resolve a user's desired state from the user → cohort → pilot cascade.
 * Pure: the snapshot status is filesystem state and is added by the loader.
 */
export function resolveUserIdentity(
  user: UserConfig,
  cohort: LoadedCohortFile,
  pilot: PilotConfig,
): Omit<ResolvedUserIdentity, "snapshotStatus"> {
  // A cohort bundle override also replaces the pilot's add/remove lists.
  const inheritsPilotLists = cohort.data.bundlesOverride === undefined;

  return {
    handle: user.handle,
    cohort: cohort.id,
    brainVersion: cohort.data.brainVersionOverride ?? pilot.brainVersion,
    bundleContract: pilot.bundleContract,
    bundles: [...(cohort.data.bundlesOverride ?? pilot.bundles)],
    add: cascadeCapabilityList(
      cohort.data.addOverride ?? (inheritsPilotLists ? pilot.add : undefined),
      user.addOverride,
    ),
    remove: cascadeCapabilityList(
      cohort.data.removeOverride ??
        (inheritsPilotLists ? pilot.remove : undefined),
      user.removeOverride,
    ),
    domain: user.domainOverride ?? `${user.handle}${pilot.domainSuffix}`,
    ...definedFields({ cloudflareZoneId: user.cloudflareZoneId }),
    contentRepo:
      user.contentRepoOverride ??
      `${pilot.contentRepoPrefix}${user.handle}-content`,
    ...definedFields({
      profileKind: user.profileKind,
      anchorKind: user.anchorKind,
      embeddingEnabled: user.embeddingEnabled,
      embeddingModel: user.embeddingModel,
      spaces: user.spaces,
      plugins: user.plugins,
      topicExtractionEnabled: user.topicExtractionEnabled,
      skillDerivationEnabled: user.skillDerivationEnabled,
      swotDerivationEnabled: user.swotDerivationEnabled,
      siteOverride: user.siteOverride && { ...user.siteOverride },
    }),
    discordEnabled: user.discord.enabled,
    ...definedFields({ discordAnchorUserId: user.discord.anchorUserId }),
    effectiveAiApiKey:
      user.aiApiKeyOverride ?? cohort.data.aiApiKeyOverride ?? pilot.aiApiKey,
    effectiveGitSyncToken:
      user.gitSyncTokenOverride ??
      cohort.data.gitSyncTokenOverride ??
      pilot.gitSyncToken,
    ...definedFields({
      setup: user.setup,
      atproto: user.atproto,
      playbooks: user.playbooks,
    }),
    anchorProfile: resolveAnchorProfile(user.handle, user.anchorProfile),
  };
}

/** Inherited list (cohort, else pilot) plus the user's additions, deduplicated. */
function cascadeCapabilityList(
  inherited: string[] | undefined,
  userAdditions: string[] | undefined,
): string[] {
  return uniqueStrings([...(inherited ?? []), ...(userAdditions ?? [])]);
}

async function loadUserFiles(rootDir: string): Promise<LoadedUserFile[]> {
  const userDir = join(rootDir, "users");
  const userFiles = (await listYamlFiles(userDir)).filter(
    (filePath) => !basename(filePath).endsWith(".secrets.yaml"),
  );

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
    cohortFiles.map(async (filePath): Promise<LoadedCohortFile> => ({
      id: stripYamlExtension(basename(filePath)),
      data: await readYamlFile(filePath, cohortSchema),
    })),
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
  schema: YamlValidationSchema<T>,
): Promise<T> {
  const content = await readFile(filePath, "utf8");
  const result = parseYamlDocument(content, schema);

  if (!result.ok) {
    throw new PilotRegistryError(`${normalizePath(filePath)}: ${result.error}`);
  }

  return result.data;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function stripYamlExtension(name: string): string {
  return name.replace(/\.ya?ml$/, "");
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}
