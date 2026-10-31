import {
  BaseEntityAdapter,
  parseMarkdownWithFrontmatter,
} from "@brains/entity-service";
import type { BaseEntity } from "@brains/entity-service";
import { z } from "@brains/utils/zod";

const frontmatterRecordSchema = z.record(z.string(), z.unknown());

/**
 * Adapter base for the identity singletons, whose truth lives in the entity's
 * content frontmatter. `entity.metadata` is only a search projection extracted
 * from that content, so serialization never overlays it: a replaced name,
 * email, or website would otherwise be written back over by the projection of
 * the previous content. Frontmatter is regenerated from the parsed content,
 * preserving extension fields the domain schema does not model.
 */
export abstract class SingletonFrontmatterAdapter<
  TEntity extends BaseEntity<Record<string, unknown>>,
  TFrontmatter,
> extends BaseEntityAdapter<TEntity, Record<string, unknown>, TFrontmatter> {
  public override toMarkdown(entity: TEntity): string {
    const { metadata, content } = parseMarkdownWithFrontmatter(
      entity.content,
      frontmatterRecordSchema,
    );
    return this.buildMarkdown(content, metadata);
  }

  public override generateFrontMatter(entity: TEntity): string {
    const data = this.parseFrontmatter(entity.content);
    return this.buildMarkdown("", frontmatterRecordSchema.parse(data));
  }
}
