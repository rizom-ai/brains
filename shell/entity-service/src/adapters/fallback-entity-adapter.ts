import type { BaseEntity } from "../types";
import { baseEntitySchema, emptyFrontmatterSchema } from "../types";
import { BaseEntityAdapter } from "./base-entity-adapter";

/**
 * Minimal pass-through adapter for the "note" entity type.
 *
 * Content is returned as-is in both directions — no frontmatter,
 * no structured body. Used as a fallback when no plugin registers
 * its own "note" adapter.
 */
export class FallbackEntityAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor() {
    super({
      entityType: "note",
      purpose: "A generic entity with no specialized adapter.",
      schema: baseEntitySchema,
      frontmatterSchema: emptyFrontmatterSchema,
    });
  }

  public override toMarkdown(entity: BaseEntity): string {
    return entity.content;
  }

  public fromMarkdown(markdown: string): Partial<BaseEntity> {
    return { content: markdown };
  }
}
