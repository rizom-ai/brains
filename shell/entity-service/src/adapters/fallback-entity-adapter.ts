import { z } from "@brains/utils";
import type { BaseEntity } from "../types";
import { baseEntitySchema } from "../types";
import { BaseEntityAdapter } from "./base-entity-adapter";

/**
 * Minimal pass-through adapter for the "base" entity type.
 *
 * Content is returned as-is in both directions — no frontmatter,
 * no structured body. Used as a fallback when no plugin registers
 * its own "base" adapter.
 */
export class FallbackEntityAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor() {
    super({
      entityType: "base",
      schema: baseEntitySchema,
      frontmatterSchema: z.object({}),
    });
  }

  public toMarkdown(entity: BaseEntity): string {
    return entity.content;
  }

  public fromMarkdown(markdown: string): Partial<BaseEntity> {
    return { content: markdown };
  }
}
