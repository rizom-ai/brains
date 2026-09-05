import { computeContentHash } from "@brains/utils/hash";
import type { BaseEntity, RawContentVisibility } from "../index";

type TestEntityOverrides<T extends BaseEntity> = Partial<
  Omit<T, "entityType" | "visibility">
> & {
  /** Named here because `Partial<Omit<T, ...>>` cannot expose it while T is
   * still a type parameter, which is what forced reading it through an
   * assertion. */
  content?: string;
  contentHash?: string;
  visibility?: RawContentVisibility;
};

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
  overrides: TestEntityOverrides<T> = {},
): T {
  const content = overrides.content ?? `Test ${entityType} content`;
  const now = new Date().toISOString();
  const id = overrides.id ?? `test-${entityType}-${Date.now()}`;

  // Constructing a value of an unresolved type parameter from a base plus
  // overrides is not expressible: T is only known to extend BaseEntity, so
  // nothing here can prove the result is exactly T. The factory is the one
  // place this is named, rather than every call site building entities by hand.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above
  return {
    id,
    entityType,
    content,
    contentHash: overrides.contentHash ?? computeContentHash(content),
    created: overrides.created ?? now,
    updated: overrides.updated ?? now,
    visibility: overrides.visibility ?? "public",
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
  overridesArray: Array<TestEntityOverrides<T>>,
): T[] {
  return overridesArray.map((overrides, index) =>
    createTestEntity<T>(entityType, {
      id: `test-${entityType}-${index}`,
      ...overrides,
    }),
  );
}
