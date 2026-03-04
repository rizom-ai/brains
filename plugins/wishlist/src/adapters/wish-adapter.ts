import { BaseEntityAdapter } from "@brains/plugins";
import { slugify } from "@brains/utils";
import {
  wishSchema,
  wishFrontmatterSchema,
  type WishEntity,
  type WishFrontmatter,
  type WishMetadata,
} from "../schemas/wish";

export class WishAdapter extends BaseEntityAdapter<WishEntity, WishMetadata> {
  constructor() {
    super({
      entityType: "wish",
      schema: wishSchema,
      frontmatterSchema: wishFrontmatterSchema,
    });
  }

  public createWishContent(
    frontmatter: WishFrontmatter,
    description: string,
  ): string {
    return this.buildMarkdown(description, frontmatter);
  }

  public parseWishContent(content: string): {
    frontmatter: WishFrontmatter;
    description: string;
  } {
    // Parse through schema to apply defaults (priority, requested, tags)
    const raw = this.parseFrontMatter(content, wishFrontmatterSchema);
    return {
      frontmatter: wishFrontmatterSchema.parse(raw),
      description: this.extractBody(content).trim(),
    };
  }

  public toMarkdown(entity: WishEntity): string {
    return entity.content;
  }

  public fromMarkdown(markdown: string): Partial<WishEntity> {
    const { frontmatter } = this.parseWishContent(markdown);
    const slug = slugify(frontmatter.title);
    return {
      content: markdown,
      entityType: "wish",
      metadata: {
        title: frontmatter.title,
        status: frontmatter.status,
        priority: frontmatter.priority,
        requested: frontmatter.requested,
        slug,
      },
    };
  }
}
