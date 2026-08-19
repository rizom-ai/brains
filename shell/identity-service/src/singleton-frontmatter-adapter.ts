import { BaseEntityAdapter } from "@brains/entity-service";
import type { BaseEntity } from "@brains/entity-service";
import { z } from "@brains/utils/zod";

const frontmatterRecordSchema = z.record(z.string(), z.unknown());

/**
 * Adapter base for the identity singletons, whose truth lives in the entity's
 * content frontmatter rather than in `entity.metadata` (which stays empty).
 * Frontmatter is therefore regenerated from the parsed content instead of the
 * base class's metadata overlay, preserving extension fields the domain schema
 * does not model.
 */
export abstract class SingletonFrontmatterAdapter<
  TEntity extends BaseEntity<Record<string, unknown>>,
  TFrontmatter,
> extends BaseEntityAdapter<TEntity, Record<string, unknown>, TFrontmatter> {
  public override generateFrontMatter(entity: TEntity): string {
    const data = this.parseFrontmatter(entity.content);
    return this.buildMarkdown("", frontmatterRecordSchema.parse(data));
  }
}
