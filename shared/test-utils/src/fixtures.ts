import { computeContentHash } from "@brains/utils";
import type { BaseEntity } from "@brains/entity-service";

/**
 * Create a test entity with sensible defaults.
 *
 * Handles common boilerplate:
 * - Generates unique ID if not provided
 * - Sets created/updated timestamps to now
 * - Computes contentHash from content
 * - Provides empty metadata object
 *
 * @example
 * ```typescript
 * // Simple entity
 * const note = createTestEntity("note", { title: "Test", slug: "test" });
 *
 * // With specific ID
 * const post = createTestEntity("post", {
 *   id: "post-123",
 *   title: "My Post",
 *   slug: "my-post",
 *   metadata: { seriesName: "my-series" }
 * });
 *
 * // With type parameter for better inference
 * const typedPost = createTestEntity<PostEntity>("post", {
 *   title: "Typed Post",
 *   slug: "typed-post",
 * });
 * ```
 */
export function createTestEntity<T extends BaseEntity = BaseEntity>(
  entityType: string,
  overrides: Partial<Omit<T, "entityType">> & { contentHash?: string } = {},
): T {
  const content =
    (overrides as { content?: string }).content ?? `Test ${entityType} content`;
  const now = new Date().toISOString();
  const id = overrides.id ?? `test-${entityType}-${Date.now()}`;

  return {
    id,
    entityType,
    content,
    contentHash: overrides.contentHash ?? computeContentHash(content),
    created: overrides.created ?? now,
    updated: overrides.updated ?? now,
    metadata: overrides.metadata ?? {},
    ...overrides,
  } as T;
}

/**
 * Create multiple test entities of the same type.
 *
 * @example
 * ```typescript
 * const posts = createTestEntities("post", [
 *   { title: "First", slug: "first" },
 *   { title: "Second", slug: "second" },
 * ]);
 * ```
 */
export function createTestEntities<T extends BaseEntity = BaseEntity>(
  entityType: string,
  overridesArray: Array<
    Partial<Omit<T, "entityType">> & { contentHash?: string }
  >,
): T[] {
  return overridesArray.map((overrides, index) =>
    createTestEntity<T>(entityType, {
      id: `test-${entityType}-${index}`,
      ...overrides,
    }),
  );
}
