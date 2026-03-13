import type {
  DeckEntity,
  DeckFrontmatter,
  DeckMetadata,
} from "../../src/schemas/deck";
import { createTestEntity } from "@brains/test-utils";
import { generateMarkdownWithFrontmatter } from "@brains/plugins";

/**
 * Default deck metadata for tests
 */
export const defaultDeckMetadata: DeckMetadata = {
  slug: "test-deck",
  title: "Test Deck",
  status: "draft",
};

interface MockDeckOptions {
  id?: string;
  title?: string;
  status?: "draft" | "queued" | "published";
  description?: string;
  author?: string;
  publishedAt?: string;
  event?: string;
  coverImageId?: string;
  content?: string; // Slide body content (without frontmatter)
  created?: string;
  updated?: string;
  metadata?: DeckMetadata;
}

/**
 * Create a mock DeckEntity with proper frontmatter in content
 */
export function createMockDeckEntity(
  overrides: MockDeckOptions & { content: string },
): DeckEntity {
  const title = overrides.title ?? "Test Deck";
  const status = overrides.status ?? "draft";
  const slug = overrides.id ?? "test-deck";

  const metadata: DeckMetadata = overrides.metadata ?? {
    slug,
    title,
    status,
    ...(overrides.publishedAt && { publishedAt: overrides.publishedAt }),
    ...(overrides.coverImageId && { coverImageId: overrides.coverImageId }),
  };

  // Build content with frontmatter, filtering out undefined values
  const frontmatter: Partial<DeckFrontmatter> = { title, status, slug };
  if (overrides.description) frontmatter.description = overrides.description;
  if (overrides.author) frontmatter.author = overrides.author;
  if (overrides.publishedAt) frontmatter.publishedAt = overrides.publishedAt;
  if (overrides.event) frontmatter.event = overrides.event;
  if (overrides.coverImageId) frontmatter.coverImageId = overrides.coverImageId;

  const fullContent = generateMarkdownWithFrontmatter(
    overrides.content,
    frontmatter,
  );

  return createTestEntity<DeckEntity>("deck", {
    id: overrides.id ?? "test-deck",
    content: fullContent,
    metadata,
    ...(overrides.created && { created: overrides.created }),
    ...(overrides.updated && { updated: overrides.updated }),
  });
}
