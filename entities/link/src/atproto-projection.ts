import { canonicalAtprotoLexicons } from "@brains/atproto-contracts";
import type {
  AtprotoProjection,
  AtprotoProjectionBuildInput,
} from "@brains/atproto-contracts";
import { linkAdapter } from "./adapters/link-adapter";
import { linkSchema, type LinkSource } from "./schemas/link";

export interface LinkAtprotoRecord {
  [key: string]: unknown;
  $type: "ai.rizom.brain.link";
  title: string;
  url: string;
  description?: string;
  summary?: string;
  domain?: string;
  capturedAt?: string;
  source?: LinkSource;
  brainDid?: string;
  anchorDid?: string;
  sourceEntityType: "link";
  sourceEntityId: string;
  createdAt: string;
  updatedAt?: string;
}

export async function buildLinkAtprotoRecord({
  entity,
  config,
}: AtprotoProjectionBuildInput): Promise<LinkAtprotoRecord> {
  const link = linkSchema.parse(entity);
  const { frontmatter, summary } = linkAdapter.parseLinkContent(link.content);

  return {
    $type: "ai.rizom.brain.link",
    title: frontmatter.title,
    url: frontmatter.url,
    ...(frontmatter.description && { description: frontmatter.description }),
    ...(summary && { summary }),
    domain: frontmatter.domain,
    capturedAt: frontmatter.capturedAt,
    source: frontmatter.source,
    ...(config.brainDid && { brainDid: config.brainDid }),
    ...(config.anchorDid && { anchorDid: config.anchorDid }),
    sourceEntityType: "link",
    sourceEntityId: link.id,
    createdAt: link.created,
    ...(link.updated && { updatedAt: link.updated }),
  };
}

export function createLinkAtprotoProjection(): AtprotoProjection<LinkAtprotoRecord> {
  return {
    entityType: "link",
    collection: "ai.rizom.brain.link",
    lexicon: canonicalAtprotoLexicons["ai.rizom.brain.link"],
    validate: false,
    buildRecord: buildLinkAtprotoRecord,
  };
}
