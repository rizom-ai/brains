import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { canonicalAtprotoLexicons } from "@brains/atproto-contracts";
import type {
  AtprotoProjection,
  AtprotoProjectionBuildInput,
} from "@brains/atproto-contracts";
import { deckFrontmatterSchema, deckSchema } from "./schemas/deck";

export interface DeckAtprotoRecord {
  [key: string]: unknown;
  $type: "ai.rizom.brain.deck";
  title: string;
  slug?: string;
  description?: string;
  body: string;
  format: "text/markdown";
  author?: string;
  event?: string;
  publishedAt?: string;
  brainDid?: string;
  anchorDid?: string;
  sourceEntityType: "deck";
  sourceEntityId: string;
  createdAt: string;
  updatedAt?: string;
}

export async function buildDeckAtprotoRecord({
  entity,
  config,
}: AtprotoProjectionBuildInput): Promise<DeckAtprotoRecord> {
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
    ...(config.brainDid && { brainDid: config.brainDid }),
    ...(config.anchorDid && { anchorDid: config.anchorDid }),
    sourceEntityType: "deck",
    sourceEntityId: deck.id,
    createdAt: deck.created,
    ...(deck.updated && { updatedAt: deck.updated }),
  };
}

export function createDeckAtprotoProjection(): AtprotoProjection<DeckAtprotoRecord> {
  return {
    entityType: "deck",
    collection: "ai.rizom.brain.deck",
    lexicon: canonicalAtprotoLexicons["ai.rizom.brain.deck"],
    validate: false,
    buildRecord: buildDeckAtprotoRecord,
  };
}
