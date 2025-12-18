import type { DeckEntity, DeckMetadata } from "../../src/schemas/deck";
import { computeContentHash } from "@brains/utils";

/**
 * Default deck metadata for tests
 */
export const defaultDeckMetadata: DeckMetadata = {
  slug: "test-deck",
  title: "Test Deck",
  status: "draft",
};

/**
 * Create a mock DeckEntity with computed contentHash
 */
export function createMockDeckEntity(
  overrides: Partial<Omit<DeckEntity, "contentHash">> & { content: string },
): DeckEntity {
  const content = overrides.content;
  const title = overrides.title ?? "Test Deck";
  const status = overrides.status ?? "draft";
  return {
    id: overrides.id ?? "test-deck",
    entityType: "deck",
    content,
    contentHash: computeContentHash(content),
    title,
    status,
    created: overrides.created ?? new Date().toISOString(),
    updated: overrides.updated ?? new Date().toISOString(),
    metadata: overrides.metadata ?? {
      slug: overrides.id ?? "test-deck",
      title,
      status,
    },
    description: overrides.description,
    author: overrides.author,
    publishedAt: overrides.publishedAt,
    event: overrides.event,
  };
}

/**
 * Create partial deck entity input (without id/created/updated)
 */
export function createMockDeckInput(
  overrides: Partial<
    Omit<DeckEntity, "contentHash" | "id" | "created" | "updated">
  > & { content: string },
): Omit<DeckEntity, "id" | "created" | "updated"> {
  const content = overrides.content;
  const title = overrides.title ?? "Test Deck";
  const status = overrides.status ?? "draft";
  return {
    entityType: "deck",
    content,
    contentHash: computeContentHash(content),
    title,
    status,
    metadata: overrides.metadata ?? {
      slug: "test-deck",
      title,
      status,
    },
    description: overrides.description,
    author: overrides.author,
    publishedAt: overrides.publishedAt,
    event: overrides.event,
  };
}
