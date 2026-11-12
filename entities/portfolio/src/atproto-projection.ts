import {
  atprotoProvenance,
  canonicalAtprotoLexicons,
} from "@brains/atproto-contracts";
import type { AtprotoBrainProjectRecord } from "@brains/atproto-contracts";
import type {
  EntityAtprotoProjection,
  EntityAtprotoRecordInput,
  EntityDefinition,
  EntityOf,
} from "@brains/sdk/entities";
import type { projectMetadataSchema } from "./schemas/project";

type ProjectRecord = EntityOf<
  EntityDefinition<"project", typeof projectMetadataSchema>
>;

/** A project as its ai.rizom.brain.project record: its fields and its body. */
export async function buildProjectAtprotoRecord({
  entity,
  config,
  pageUrl,
}: EntityAtprotoRecordInput<ProjectRecord>): Promise<AtprotoBrainProjectRecord> {
  const { metadata } = entity;
  return {
    $type: "ai.rizom.brain.project",
    title: metadata.title,
    slug: metadata.slug,
    description: metadata.description,
    body: entity.content,
    format: "text/markdown",
    year: metadata.year,
    ...(metadata.url && { url: metadata.url }),
    ...(metadata.publishedAt && { publishedAt: metadata.publishedAt }),
    ...atprotoProvenance({ config, pageUrl }, entity),
  };
}

/** Project records go out unvalidated, under the canonical project lexicon. */
export const projectAtproto: EntityAtprotoProjection<ProjectRecord> = {
  lexicon: canonicalAtprotoLexicons["ai.rizom.brain.project"],
  validate: false,
  buildRecord: buildProjectAtprotoRecord,
};
