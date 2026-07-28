import { toYaml } from "@brains/utils/yaml";
import { z } from "@brains/utils/zod";
import {
  cohortSchema,
  exactVersionSchema,
  handleSchema,
  pilotSchema,
  type CohortConfig,
  type PilotConfig,
} from "./schema";

const legacySelectionSchema = z.enum(["core", "default", "pro"]);
const legacySecretNameSchema = z.string().min(1);

const legacyPilotSchema = z.strictObject({
  schemaVersion: z.literal(1),
  brainVersion: exactVersionSchema,
  model: z.literal("rover"),
  githubOrg: z.string().min(1),
  contentRepoPrefix: z.string().min(1),
  domainSuffix: z.string().min(1),
  preset: legacySelectionSchema,
  aiApiKey: legacySecretNameSchema,
  gitSyncToken: legacySecretNameSchema,
  contentRepoAdminToken: legacySecretNameSchema,
  agePublicKey: z.string().startsWith("age1").min(1),
});

const legacyCohortSchema = z
  .strictObject({
    members: z.array(handleSchema).min(1),
    brainVersionOverride: exactVersionSchema.optional(),
    presetOverride: legacySelectionSchema.optional(),
    aiApiKeyOverride: legacySecretNameSchema.optional(),
    gitSyncTokenOverride: legacySecretNameSchema.optional(),
  })
  .superRefine((value, context) => {
    if (new Set(value.members).size !== value.members.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["members"],
        message: "cohort members must be unique",
      });
    }
  });

type LegacySelection = z.output<typeof legacySelectionSchema>;

interface CanonicalSelection {
  bundles: PilotConfig["bundles"];
  add?: string[] | undefined;
  remove?: string[] | undefined;
}

const defaultRemovals = [
  "series",
  "portfolio",
  "content-pipeline",
  "social-media",
  "newsletter",
  "stock-photo",
];

function canonicalSelection(selection: LegacySelection): CanonicalSelection {
  if (selection === "core") return { bundles: ["core"] };
  if (selection === "default") {
    return {
      bundles: ["core", "site", "publishing"],
      add: ["obsidian-vault"],
      remove: [...defaultRemovals],
    };
  }
  return {
    bundles: ["core", "site", "publishing"],
    add: ["obsidian-vault"],
  };
}

/** Offline-only conversion. Active desired-state loading never calls this. */
export function migrateLegacyPilotConfig(input: unknown): PilotConfig {
  const legacy = legacyPilotSchema.parse(input);
  return pilotSchema.parse({
    schemaVersion: 2,
    brainVersion: legacy.brainVersion,
    ...canonicalSelection(legacy.preset),
    githubOrg: legacy.githubOrg,
    contentRepoPrefix: legacy.contentRepoPrefix,
    domainSuffix: legacy.domainSuffix,
    aiApiKey: legacy.aiApiKey,
    gitSyncToken: legacy.gitSyncToken,
    contentRepoAdminToken: legacy.contentRepoAdminToken,
    agePublicKey: legacy.agePublicKey,
  });
}

/** Offline-only cohort conversion. */
export function migrateLegacyCohortConfig(input: unknown): CohortConfig {
  const legacy = legacyCohortSchema.parse(input);
  const selection = legacy.presetOverride
    ? canonicalSelection(legacy.presetOverride)
    : undefined;
  return cohortSchema.parse({
    members: [...legacy.members],
    ...(legacy.brainVersionOverride
      ? { brainVersionOverride: legacy.brainVersionOverride }
      : {}),
    ...(selection
      ? {
          bundlesOverride: selection.bundles,
          ...(selection.add ? { addOverride: selection.add } : {}),
          ...(selection.remove ? { removeOverride: selection.remove } : {}),
        }
      : {}),
    ...(legacy.aiApiKeyOverride
      ? { aiApiKeyOverride: legacy.aiApiKeyOverride }
      : {}),
    ...(legacy.gitSyncTokenOverride
      ? { gitSyncTokenOverride: legacy.gitSyncTokenOverride }
      : {}),
  });
}

export function renderPilotConfig(config: PilotConfig): string {
  return toYaml(pilotSchema.parse(config));
}

export function renderCohortConfig(config: CohortConfig): string {
  return toYaml(cohortSchema.parse(config));
}
