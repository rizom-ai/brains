import {
  baseEntitySchema,
  type BaseEntity,
  type EntityAdapter,
} from "../index";
import type { z } from "@brains/utils/zod";

/**
 * A target type registered as one that takes a cover, the way `post` and
 * `deck` declare it.
 *
 * Linking a cover into a type that never declared one is refused by the same
 * rule `system_update` applies, so a test that seeds bare entities under an
 * unregistered type is refused too — correctly. The adapter here is the least
 * that satisfies the registry plus the one flag under test.
 */
export function coverTakingType(entityType: string): EntityAdapter<BaseEntity> {
  return {
    entityType,
    schema: baseEntitySchema,
    purpose: "Something an image can be the cover of.",
    fromMarkdown: () => ({}),
    toMarkdown: (entity) => entity.content,
    extractMetadata: () => ({}),
    parseFrontMatter: <T>(_markdown: string, schema: z.ZodType<T>): T =>
      schema.parse({}),
    generateFrontMatter: () => "",
    getBodyTemplate: () => "",
    supportsCoverImage: true,
  };
}
