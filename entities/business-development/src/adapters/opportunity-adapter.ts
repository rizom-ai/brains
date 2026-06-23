import { BaseEntityAdapter } from "@brains/plugins";
import { slugify } from "@brains/utils";
import {
  opportunityFrontmatterSchema,
  opportunitySchema,
  type OpportunityEntity,
  type OpportunityFrontmatter,
  type OpportunityMetadata,
} from "../schemas/opportunity";

export class OpportunityAdapter extends BaseEntityAdapter<
  OpportunityEntity,
  OpportunityMetadata
> {
  constructor() {
    super({
      entityType: "opportunity",
      schema: opportunitySchema,
      frontmatterSchema: opportunityFrontmatterSchema,
    });
  }

  public createOpportunityContent(
    frontmatter: OpportunityFrontmatter,
    description: string,
  ): string {
    return this.buildMarkdown(description, frontmatter);
  }

  public parseOpportunityContent(content: string): {
    frontmatter: OpportunityFrontmatter;
    description: string;
  } {
    return {
      frontmatter: this.parseFrontMatter(content, opportunityFrontmatterSchema),
      description: this.extractBody(content).trim(),
    };
  }

  public fromMarkdown(markdown: string): Partial<OpportunityEntity> {
    const { frontmatter } = this.parseOpportunityContent(markdown);
    const slug = slugify(frontmatter.title);

    return {
      content: markdown,
      entityType: "opportunity",
      metadata: {
        ...frontmatter,
        slug,
      },
    };
  }
}

export const opportunityAdapter = new OpportunityAdapter();
