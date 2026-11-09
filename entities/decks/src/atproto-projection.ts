import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import {
  atprotoProvenance,
  defineAtprotoProjection,
} from "@brains/atproto-contracts";
import type {
  AtprotoBrainDeckRecord,
  AtprotoProjection,
  AtprotoProjectionBuildInput,
} from "@brains/atproto-contracts";
import { deckFrontmatterSchema, deckSchema } from "./schemas/deck";

export async function buildDeckAtprotoRecord({
  entity,
  config,
  pageUrl,
}: AtprotoProjectionBuildInput): Promise<AtprotoBrainDeckRecord> {
  const deck = deckSchema.parse(entity);
  const parsed = parseMarkdownWithFrontmatter(
    deck.content,
    deckFrontmatterSchema,
  );
  const frontmatter = parsed.metadata;

  return {
    $type: "ai.rizom.brain.deck",
    title: frontmatter.title,
    ...(frontmatter.slug && { slug: frontmatter.slug }),
    ...(frontmatter.description && { description: frontmatter.description }),
    body: parsed.content,
    format: "text/markdown",
    ...(frontmatter.author && { author: frontmatter.author }),
    ...(frontmatter.event && { event: frontmatter.event }),
    ...(frontmatter.publishedAt && { publishedAt: frontmatter.publishedAt }),
    ...atprotoProvenance({ config, pageUrl }, deck),
  };
}

export function createDeckAtprotoProjection(): AtprotoProjection<AtprotoBrainDeckRecord> {
  return defineAtprotoProjection({
    entityType: "deck",
    collection: "ai.rizom.brain.deck",
    buildRecord: buildDeckAtprotoRecord,
  });
}
