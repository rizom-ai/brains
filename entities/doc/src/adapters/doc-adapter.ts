import { BaseEntityAdapter } from "@brains/plugins";
import { slugify } from "@brains/utils/string-utils";
import {
  docSchema,
  docFrontmatterSchema,
  type Doc,
  type DocMetadata,
  type DocFrontmatter,
} from "../schemas/doc";

export class DocAdapter extends BaseEntityAdapter<
  Doc,
  DocMetadata,
  DocFrontmatter
> {
  constructor() {
    super({
      entityType: "doc",
      purpose: "A structured documentation page.",
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
