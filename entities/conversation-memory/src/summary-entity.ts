import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import { withDisplayTitle } from "@brains/sdk/internal/entity-runtime";
import { composeSummaryBody, parseSummaryBody } from "./lib/summary-body";
import {
  SUMMARY_RETIRED_FIELDS,
  summaryMetadataSchema,
} from "./schemas/summary";
import { SUMMARY_ENTITY_TYPE } from "./lib/constants";

/**
 * A read-only, system-maintained summary derived from stored conversation
 * messages: its body is its entries, its frontmatter its metadata. A read
 * takes the body as stored, as the summary adapter kept it; a write renders
 * the body from its entries, refusing one that does not parse, as the
 * adapter did, so a malformed summary is never imported.
 */
export const summary: EntityDefinition<
  typeof SUMMARY_ENTITY_TYPE,
  typeof summaryMetadataSchema
> = withDisplayTitle(
  defineEntity({
    type: SUMMARY_ENTITY_TYPE,
    purpose:
      "A read-only, system-maintained summary derived from stored conversation messages.",
    metadata: summaryMetadataSchema,
    markdown: {
      decode: ({ content, frontmatter }) => ({
        content: content.replace(/^\n+/u, ""),
        metadata: summaryMetadataSchema.parse(frontmatter),
      }),
      encode: ({ content, metadata }) => ({
        content: composeSummaryBody(parseSummaryBody(content).entries),
        frontmatter: summaryMetadataSchema.parse(metadata),
      }),
    },
    config: {
      projectionSource: false,
      projectionSourceRole: "excluded",
      retiredFields: [...SUMMARY_RETIRED_FIELDS],
    },
    // Nobody edits a summary by hand. A user who could rewrite one could
    // rewrite what the brain remembers happening.
    actions: {
      create: "never",
      update: "never",
      delete: "never",
      extract: "never",
      publish: "never",
    },
  }),
  // Named by where and when its conversation happened: the day it started,
  // or the day the summary was stored when it records no start.
  ({ metadata, created }) =>
    `${metadata.channelName ?? metadata.channelId} · ${(metadata.timeRange?.start ?? created).slice(0, 10)}`,
);
