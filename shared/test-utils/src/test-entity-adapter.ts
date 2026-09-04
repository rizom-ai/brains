import {
  BaseEntityAdapter,
  baseEntitySchema,
  emptyFrontmatterSchema,
} from "@brains/entity-service";
import type { BaseEntity, EntityAdapter } from "@brains/entity-service";

/**
 * A working adapter for a type a test only needs registered.
 *
 * Registering `{} as never` as the schema and adapter was the shortcut, and it
 * meant nothing checked that the registry received anything usable: a test
 * whose subject later reached for the adapter failed somewhere far from the
 * registration, with a message about a missing method rather than a missing
 * adapter. This is a real one — the content is the markdown, and no
 * frontmatter is added — so the registry gets what it asked for.
 */
export interface TestEntityAdapterOptions {
  isSingleton?: boolean;
  hasBody?: boolean;
  supportsCoverImage?: boolean;
}

class TestEntityAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor(entityType: string, options: TestEntityAdapterOptions = {}) {
    super({
      entityType,
      purpose: `A ${entityType} registered by a test.`,
      schema: baseEntitySchema,
      frontmatterSchema: emptyFrontmatterSchema,
      ...options,
    });
  }

  public override toMarkdown(entity: BaseEntity): string {
    return entity.content;
  }

  public fromMarkdown(markdown: string): Partial<BaseEntity> {
    return { content: markdown };
  }
}

export function createTestEntityAdapter(
  entityType: string,
  options: TestEntityAdapterOptions = {},
): EntityAdapter<BaseEntity> {
  return new TestEntityAdapter(entityType, options);
}
