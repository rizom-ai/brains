import {
  atprotoProvenance,
  defineAtprotoProjection,
} from "@brains/atproto-contracts";
import type {
  AtprotoBrainLinkRecord,
  AtprotoProjection,
  AtprotoProjectionBuildInput,
} from "@brains/atproto-contracts";
import { linkAdapter } from "./adapters/link-adapter";
import { linkSchema } from "./schemas/link";

export async function buildLinkAtprotoRecord({
  entity,
  config,
  pageUrl,
}: AtprotoProjectionBuildInput): Promise<AtprotoBrainLinkRecord> {
  const link = linkSchema.parse(entity);
  const { frontmatter, summary } = linkAdapter.parseLinkContent(link.content);

  return {
    $type: "ai.rizom.brain.link",
    title: frontmatter.title,
    url: frontmatter.url,
    ...(frontmatter.description && { description: frontmatter.description }),
    ...(summary && { summary }),
    domain: new URL(frontmatter.url).hostname,
    capturedAt: frontmatter.capturedAt,
    source: frontmatter.source,
    ...atprotoProvenance({ config, pageUrl }, link),
  };
}

export function createLinkAtprotoProjection(): AtprotoProjection<AtprotoBrainLinkRecord> {
  return defineAtprotoProjection({
    entityType: "link",
    collection: "ai.rizom.brain.link",
    buildRecord: buildLinkAtprotoRecord,
  });
}
