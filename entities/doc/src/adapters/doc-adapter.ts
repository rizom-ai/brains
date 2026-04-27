import { BaseEntityAdapter } from "@brains/plugins";
import { slugify } from "@brains/utils";
import {
  docSchema,
  docFrontmatterSchema,
  type Doc,
  type DocMetadata,
} from "../schemas/doc";

export class DocAdapter extends BaseEntityAdapter<Doc, DocMetadata> {
  constructor() {
    super({
      entityType: "doc",
      schema: docSchema,
      frontmatterSchema: docFrontmatterSchema,
    });
  }

  public override toMarkdown(entity: Doc): string {
    const body = this.extractBody(entity.content);
    const frontmatter = this.parseFrontMatter(
      entity.content,
      docFrontmatterSchema,
    );
    return this.buildMarkdown(body, frontmatter);
  }

  public fromMarkdown(markdown: string): Partial<Doc> {
    const frontmatter = this.parseFrontMatter(markdown, docFrontmatterSchema);
    const slug = frontmatter.slug ?? slugify(frontmatter.title);

    return {
      content: markdown,
      entityType: "doc",
      metadata: {
        title: frontmatter.title,
        section: frontmatter.section,
        order: frontmatter.order,
        slug,
        ...(frontmatter.description
          ? { description: frontmatter.description }
          : {}),
      },
    };
  }
}

export const docAdapter = new DocAdapter();
