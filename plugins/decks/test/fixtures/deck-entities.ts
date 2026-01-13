import type { DeckEntity, DeckMetadata } from "../../src/schemas/deck";
import { createTestEntity } from "@brains/test-utils";

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
  const title = overrides.title ?? "Test Deck";
  const status = overrides.status ?? "draft";
  return createTestEntity<DeckEntity>("deck", {
    id: overrides.id ?? "test-deck",
    content: overrides.content,
    title,
    status,
    ...(overrides.created && { created: overrides.created }),
    ...(overrides.updated && { updated: overrides.updated }),
    metadata: overrides.metadata ?? {
      slug: overrides.id ?? "test-deck",
      title,
      status,
    },
    ...(overrides.description && { description: overrides.description }),
    ...(overrides.author && { author: overrides.author }),
    ...(overrides.publishedAt && { publishedAt: overrides.publishedAt }),
    ...(overrides.event && { event: overrides.event }),
  });
}

/**
 * Create partial deck entity input (without id/created/updated)
 */
export function createMockDeckInput(
  overrides: Partial<
    Omit<DeckEntity, "contentHash" | "id" | "created" | "updated">
  > & { content: string },
): Omit<DeckEntity, "id" | "created" | "updated"> {
  const title = overrides.title ?? "Test Deck";
  const status = overrides.status ?? "draft";
  const base = createTestEntity<DeckEntity>("deck", {
    content: overrides.content,
    title,
    status,
    metadata: overrides.metadata ?? {
      slug: "test-deck",
      title,
      status,
    },
    ...(overrides.description && { description: overrides.description }),
    ...(overrides.author && { author: overrides.author }),
    ...(overrides.publishedAt && { publishedAt: overrides.publishedAt }),
    ...(overrides.event && { event: overrides.event }),
  });
  // Remove id/created/updated for input type
  const { id: _id, created: _created, updated: _updated, ...rest } = base;
  return rest;
}
