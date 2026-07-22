import {
  BaseEntityAdapter,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import {
  styleGuideEntitySchema,
  styleGuideFrontmatterSchema,
  type StyleGuide,
  type StyleGuideEntity,
  type StyleGuideFrontmatter,
  type StyleGuideMetadata,
} from "./schema";

export class StyleGuideAdapter extends BaseEntityAdapter<
  StyleGuideEntity,
  StyleGuideMetadata,
  StyleGuideFrontmatter
> {
  constructor() {
    super({
      entityType: "style-guide",
      purpose:
        "Singleton messaging, voice, and visual guidance for generated artifacts.",
      schema: styleGuideEntitySchema,
      frontmatterSchema: styleGuideFrontmatterSchema,
      isSingleton: true,
      hasBody: true,
    });
  }

  public createStyleGuideContent(
    frontmatter: StyleGuideFrontmatter,
    guidance: string = "",
  ): string {
    return this.buildMarkdown(
      guidance,
      styleGuideFrontmatterSchema.parse(frontmatter),
    );
  }

  public parseStyleGuide(content: string): StyleGuide {
    const parsed = parseMarkdownWithFrontmatter(
      content,
      styleGuideFrontmatterSchema,
    );
    return {
      ...parsed.metadata,
      guidance: parsed.content,
    };
  }

  public fromMarkdown(markdown: string): Partial<StyleGuideEntity> {
    return { content: markdown, entityType: "style-guide" };
  }

  public override extractMetadata(
    _entity: StyleGuideEntity,
  ): StyleGuideMetadata {
    return {};
  }
}

export const styleGuideAdapter: StyleGuideAdapter = new StyleGuideAdapter();
