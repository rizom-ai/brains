import { BaseEntityAdapter, type BaseEntity } from "@brains/plugins";
import { baseEntitySchema } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";

const fixtureFrontmatterSchema = z.object({});

/** A stand-in for whichever package owns the type under test. */
export class FixtureAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor(entityType = "social-post") {
    super({
      entityType,
      purpose: "Publishing fixture",
      schema: baseEntitySchema,
      frontmatterSchema: fixtureFrontmatterSchema,
    });
  }

  public fromMarkdown(markdown: string): Partial<BaseEntity> {
    return { entityType: this.entityType, content: markdown };
  }
}
