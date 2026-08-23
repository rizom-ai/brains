import { parseYamlDocument } from "@brains/utils/yaml";
import { z } from "@brains/utils/zod";
import { isMap, parseDocument } from "yaml";
import {
  CAPABILITY_BUNDLE_CONTRACT,
  canonicalBundleIdSchema,
  cohortSchema,
  exactVersionSchema,
  handleSchema,
  pilotSchema,
  type CanonicalBundleId,
} from "./schema";

const legacyBundleIdSchema: z.ZodEnum<{
  core: "core";
  site: "site";
  publishing: "publishing";
  team: "team";
}> = z.enum(["core", "site", "publishing", "team"]);
const legacyBundlesSchema = z.array(legacyBundleIdSchema).min(1);
const memberIdsSchema = z.array(z.string().min(1));

const legacyCanonicalPilotSchema = z.strictObject({
  brainVersion: exactVersionSchema,
  bundles: legacyBundlesSchema,
  add: memberIdsSchema.optional(),
  remove: memberIdsSchema.optional(),
  githubOrg: z.string().min(1),
  contentRepoPrefix: z.string().min(1),
  domainSuffix: z.string().min(1),
  aiApiKey: z.string().min(1),
  gitSyncToken: z.string().min(1),
  contentRepoAdminToken: z.string().min(1),
  agePublicKey: z.string().startsWith("age1").min(1),
});

const legacyCanonicalCohortSchema = z.strictObject({
  members: z.array(handleSchema).min(1),
  brainVersionOverride: exactVersionSchema.optional(),
  bundlesOverride: legacyBundlesSchema.optional(),
  addOverride: memberIdsSchema.optional(),
  removeOverride: memberIdsSchema.optional(),
  aiApiKeyOverride: z.string().min(1).optional(),
  gitSyncTokenOverride: z.string().min(1).optional(),
});

const selectionRewriteSchema = z.strictObject({
  sourceBundles: legacyBundlesSchema,
  targetBundles: z.array(canonicalBundleIdSchema).min(1),
});

const capabilityBundleReviewSchema = z.strictObject({
  bundleContract: z.literal(CAPABILITY_BUNDLE_CONTRACT),
  pilot: selectionRewriteSchema,
  cohorts: z.record(handleSchema, selectionRewriteSchema),
});

export type LegacyCanonicalBundleId = z.output<typeof legacyBundleIdSchema>;
export interface SelectionRewrite {
  sourceBundles: LegacyCanonicalBundleId[];
  targetBundles: CanonicalBundleId[];
}
export interface CapabilityBundleReview {
  bundleContract: typeof CAPABILITY_BUNDLE_CONTRACT;
  pilot: SelectionRewrite;
  cohorts: Record<string, SelectionRewrite>;
}

type MigrationDocument = ReturnType<typeof parseDocument>;

function parseDocumentMapping(input: string, label: string): MigrationDocument {
  const document = parseDocument(input, { keepSourceTokens: true });
  if (document.errors.length > 0 || !isMap(document.contents)) {
    throw new Error(`Invalid ${label} YAML`);
  }
  return document;
}

function sameSelection(
  actual: readonly string[],
  reviewed: readonly string[],
): boolean {
  return (
    actual.length === reviewed.length &&
    actual.every((value, index) => value === reviewed[index])
  );
}

function assertReviewedSource(
  label: string,
  actual: readonly string[],
  review: SelectionRewrite,
): void {
  if (!sameSelection(actual, review.sourceBundles)) {
    throw new Error(
      `${label} source bundles changed after review: expected [${review.sourceBundles.join(", ")}], received [${actual.join(", ")}]`,
    );
  }
}

export function parseCapabilityBundleReview(
  input: string,
): CapabilityBundleReview {
  const result = parseYamlDocument(input, capabilityBundleReviewSchema);
  if (!result.ok) {
    throw new Error(`Invalid capability bundle review: ${result.error}`);
  }
  return result.data;
}

export function migrateCanonicalPilotYaml(
  input: string,
  review: CapabilityBundleReview["pilot"],
): string {
  const document = parseDocumentMapping(input, "pilot desired-state");
  const source = legacyCanonicalPilotSchema.parse(document.toJS());
  assertReviewedSource("pilot.yaml", source.bundles, review);

  document.set("bundleContract", CAPABILITY_BUNDLE_CONTRACT);
  document.set("bundles", review.targetBundles);
  pilotSchema.parse(document.toJS());
  return document.toString({ lineWidth: 0 });
}

export function migrateCanonicalCohortYaml(
  input: string,
  cohortId: string,
  review: SelectionRewrite | undefined,
): string {
  const document = parseDocumentMapping(input, `cohort ${cohortId}`);
  const source = legacyCanonicalCohortSchema.parse(document.toJS());

  if (source.bundlesOverride === undefined) {
    if (review !== undefined) {
      throw new Error(
        `Capability bundle review names inheriting cohort ${cohortId}`,
      );
    }
  } else {
    if (review === undefined) {
      throw new Error(
        `Cohort ${cohortId} has an explicit legacy bundle selection but no reviewed mapping`,
      );
    }
    assertReviewedSource(`cohort ${cohortId}`, source.bundlesOverride, review);
    document.set("bundlesOverride", review.targetBundles);
  }

  cohortSchema.parse(document.toJS());
  return document.toString({ lineWidth: 0 });
}
