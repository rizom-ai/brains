import { BaseEntityAdapter } from "@brains/entity-service";
import type { BaseEntity } from "@brains/entity-service";
import { z } from "@brains/utils/zod";

const frontmatterRecordSchema = z.record(z.string(), z.unknown());

/**
 * Adapter base for the identity singletons, whose truth lives in the entity's
 * content frontmatter rather than in projected `entity.metadata`.
 * Serialization must not overlay stale metadata onto replacement content;
 * authored extension fields and the body remain intact.
 */
export abstract class SingletonFrontmatterAdapter<
  TEntity extends BaseEntity<Record<string, unknown>>,
  TFrontmatter,
> extends BaseEntityAdapter<TEntity, Record<string, unknown>, TFrontmatter> {
  public override toMarkdown(entity: TEntity): string {
    // Metadata is a projection, not an edit to this singleton's authored file.
    // Keep the base serializer's body/extension preservation, without overlaying
    // metadata from the previous revision onto replacement frontmatter.
    return super.toMarkdown({ ...entity, metadata: {} });
  }

  public override generateFrontMatter(entity: TEntity): string {
    const data = this.parseFrontmatter(entity.content);
    return this.buildMarkdown("", frontmatterRecordSchema.parse(data));
  }
}
