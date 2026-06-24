import { BaseEntityAdapter } from "@brains/plugins";
import { slugify } from "@brains/utils";
import {
  whitepaperSchema,
  whitepaperFrontmatterSchema,
  type Whitepaper,
  type WhitepaperFrontmatter,
  type WhitepaperMetadata,
} from "../schemas/whitepaper";

export class WhitepaperAdapter extends BaseEntityAdapter<
  Whitepaper,
  WhitepaperMetadata
> {
  constructor() {
    super({
      entityType: "whitepaper",
      schema: whitepaperSchema,
      frontmatterSchema: whitepaperFrontmatterSchema,
      supportsCoverImage: true,
    });
  }

  public override toMarkdown(entity: Whitepaper): string {
    const body = this.extractBody(entity.content);
    const frontmatter = this.parseFrontMatter(
      entity.content,
      whitepaperFrontmatterSchema,
    );

    return this.buildMarkdown(body, {
      ...frontmatter,
      slug: frontmatter.slug ?? entity.metadata.slug,
    });
  }

  public fromMarkdown(markdown: string): Partial<Whitepaper> {
    const frontmatter = this.parseFrontMatter(
      markdown,
      whitepaperFrontmatterSchema,
    );
    const slug = frontmatter.slug ?? slugify(frontmatter.title);

    return {
      content: markdown,
      entityType: "whitepaper",
      metadata: {
        title: frontmatter.title,
        status: frontmatter.status,
        slug,
        publishedAt: frontmatter.publishedAt,
      },
    };
  }

  public parseWhitepaperFrontmatter(entity: Whitepaper): WhitepaperFrontmatter {
    return this.parseFrontMatter(entity.content, whitepaperFrontmatterSchema);
  }

  public createWhitepaperContent(
    frontmatter: WhitepaperFrontmatter,
    body: string,
  ): string {
    return this.buildMarkdown(body, {
      ...frontmatter,
      slug: frontmatter.slug ?? slugify(frontmatter.title),
    });
  }

  public buildStub(input: { id: string; title: string }): {
    content: string;
    metadata: WhitepaperMetadata;
  } {
    const frontmatter: WhitepaperFrontmatter = {
      title: input.title,
      slug: input.id,
      status: "idea",
    };

    return {
      content: this.buildMarkdown("", frontmatter),
      metadata: {
        title: input.title,
        slug: input.id,
        status: "idea",
      },
    };
  }
}

export const whitepaperAdapter = new WhitepaperAdapter();
