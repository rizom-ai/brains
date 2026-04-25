import { BaseEntityAdapter } from "@brains/plugins";
import {
  swotEntitySchema,
  swotFrontmatterSchema,
  type SwotEntity,
  type SwotFrontmatter,
  type SwotMetadata,
} from "../schemas/swot";

export class SwotAdapter extends BaseEntityAdapter<SwotEntity, SwotMetadata> {
  constructor() {
    super({
      entityType: "swot",
      schema: swotEntitySchema,
      frontmatterSchema: swotFrontmatterSchema,
    });
  }

  public fromMarkdown(markdown: string): Partial<SwotEntity> {
    const frontmatter = this.parseFrontMatter(markdown, swotFrontmatterSchema);

    return {
      content: markdown,
      entityType: "swot",
      metadata: {
        derivedAt: frontmatter.derivedAt,
      },
    };
  }

  public createSwotContent(input: SwotFrontmatter): string {
    return this.buildMarkdown("", input);
  }

  public parseSwotContent(content: string): { frontmatter: SwotFrontmatter } {
    return {
      frontmatter: swotFrontmatterSchema.parse(
        this.parseFrontMatter(content, swotFrontmatterSchema),
      ),
    };
  }
}

export const swotAdapter = new SwotAdapter();
