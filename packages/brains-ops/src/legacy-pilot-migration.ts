import { toYaml } from "@brains/utils/yaml";
import { z } from "@brains/utils/zod";
import { isMap, isNode, isScalar, parseDocument, type Pair } from "yaml";
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

type MigrationDocument = ReturnType<typeof parseDocument>;

function parseMigrationDocument(input: string): MigrationDocument {
  const document = parseDocument(input, { keepSourceTokens: true });
  if (document.errors.length > 0) {
    throw new Error(
      `Invalid desired-state YAML: ${document.errors[0]?.message}`,
    );
  }
  if (!isMap(document.contents)) {
    throw new Error("Desired-state YAML must contain a mapping");
  }
  return document;
}

function findPair(document: MigrationDocument, key: string): Pair | undefined {
  if (!isMap(document.contents)) return undefined;
  return document.contents.items.find(
    (entry) => isScalar(entry.key) && entry.key.value === key,
  );
}

function copyNodePresentation(from: unknown, to: unknown): void {
  if (!isNode(from) || !isNode(to)) return;
  if (from.commentBefore !== undefined) {
    to.commentBefore = from.commentBefore;
  }
  if (from.comment !== undefined) {
    to.comment = from.comment;
  }
  if (from.spaceBefore !== undefined) {
    to.spaceBefore = from.spaceBefore;
  }
}

function appendPairComments(from: Pair | undefined, to: unknown): void {
  if (!from || !isNode(to)) return;
  const comments = [
    isNode(from.key) ? from.key.commentBefore : undefined,
    isNode(from.key) ? from.key.comment : undefined,
    isNode(from.value) ? from.value.commentBefore : undefined,
    isNode(from.value) ? from.value.comment : undefined,
  ].filter((comment): comment is string => comment !== undefined);
  if (comments.length === 0) return;
  to.commentBefore = [to.commentBefore, ...comments]
    .filter((comment): comment is string => comment !== undefined)
    .join("\n");
}

function replaceArrayFieldPreservingComments(
  document: MigrationDocument,
  sourceKey: string,
  targetKey: string,
  values: readonly string[],
): Pair {
  if (!isMap(document.contents)) {
    throw new Error("Desired-state YAML must contain a mapping");
  }
  const sourceIndex = document.contents.items.findIndex(
    (entry) => isScalar(entry.key) && entry.key.value === sourceKey,
  );
  const replacement = document.createPair(targetKey, [...values]);
  if (sourceIndex >= 0) {
    const previous = document.contents.items[sourceIndex];
    copyNodePresentation(previous?.key, replacement.key);
    copyNodePresentation(previous?.value, replacement.value);
    document.contents.items.splice(sourceIndex, 1, replacement);
  } else {
    document.contents.add(replacement);
  }
  return replacement;
}

/** Offline-only YAML rewrite that retains comments while changing the schema. */
export function migrateLegacyPilotYaml(input: string): string {
  const document = parseMigrationDocument(input);
  const migrated = migrateLegacyPilotConfig(document.toJS());
  const removedSchemaVersion = findPair(document, "schemaVersion");
  const removedModel = findPair(document, "model");

  appendPairComments(
    removedSchemaVersion,
    findPair(document, "brainVersion")?.key,
  );
  document.delete("schemaVersion");
  const bundles = replaceArrayFieldPreservingComments(
    document,
    "preset",
    "bundles",
    migrated.bundles,
  );
  appendPairComments(removedModel, bundles.key);
  document.delete("model");
  if (migrated.add) document.set("add", migrated.add);
  else document.delete("add");
  if (migrated.remove) document.set("remove", migrated.remove);
  else document.delete("remove");

  pilotSchema.parse(document.toJS());
  return document.toString({ lineWidth: 0 });
}

/** Offline-only cohort rewrite that retains comments while changing selection. */
export function migrateLegacyCohortYaml(input: string): string {
  const document = parseMigrationDocument(input);
  const migrated = migrateLegacyCohortConfig(document.toJS());

  if (migrated.bundlesOverride) {
    replaceArrayFieldPreservingComments(
      document,
      "presetOverride",
      "bundlesOverride",
      migrated.bundlesOverride,
    );
  } else {
    document.delete("presetOverride");
    document.delete("bundlesOverride");
  }
  if (migrated.addOverride) document.set("addOverride", migrated.addOverride);
  else document.delete("addOverride");
  if (migrated.removeOverride) {
    document.set("removeOverride", migrated.removeOverride);
  } else {
    document.delete("removeOverride");
  }

  cohortSchema.parse(document.toJS());
  return document.toString({ lineWidth: 0 });
}

export function renderPilotConfig(config: PilotConfig): string {
  return toYaml(pilotSchema.parse(config));
}

export function renderCohortConfig(config: CohortConfig): string {
  return toYaml(cohortSchema.parse(config));
}
