import type { EntityAdapter } from "@brains/base-entity";
import { type GeneratedContent, generatedContentSchema } from "@brains/types";
import {
  landingPageReferenceSchema,
  landingPageSchema,
  type LandingPageReferenceData,
} from "./content-schemas";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  generateFrontmatter,
} from "@brains/utils";
import { z } from "zod";
import yaml from "js-yaml";

// Schema for parsing frontmatter
const frontmatterSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  contentType: z.string(),
  created: z.union([z.string(), z.date()]).optional(),
  updated: z.union([z.string(), z.date()]).optional(),
});

/**
 * Adapter that stores landing page as reference data
 * The actual page data is assembled at runtime by resolving references
 */
export class LandingPageAdapter implements EntityAdapter<GeneratedContent> {
  public readonly entityType = "generated-content";
  public readonly schema = generatedContentSchema;

  public toMarkdown(entity: GeneratedContent): string {
    // Check if data is full landing page data and convert to references
    const landingPageResult = landingPageSchema.safeParse(entity.data);
    if (landingPageResult.success) {
      const referenceData: LandingPageReferenceData = {
        title: landingPageResult.data.title,
        tagline: landingPageResult.data.tagline,
        heroId: `hero-section-${landingPageResult.data.title.toLowerCase().replace(/\s+/g, "-")}`,
        featuresId: `features-section-${landingPageResult.data.title.toLowerCase().replace(/\s+/g, "-")}`,
        ctaId: `cta-section-${landingPageResult.data.title.toLowerCase().replace(/\s+/g, "-")}`,
      };

      const content = `# Landing Page Configuration

\`\`\`yaml
${yaml.dump(referenceData, { indent: 2, lineWidth: -1 })}
\`\`\``;

      return generateMarkdownWithFrontmatter(content, {
        contentType: entity.contentType,
        generatedAt: entity.metadata?.generatedAt,
      });
    }

    // Otherwise assume it's already reference data
    const referenceResult = landingPageReferenceSchema.safeParse(entity.data);
    if (referenceResult.success) {
      const content = `# Landing Page Configuration

\`\`\`yaml
${yaml.dump(referenceResult.data, { indent: 2, lineWidth: -1 })}
\`\`\``;

      return generateMarkdownWithFrontmatter(content, {
        contentType: entity.contentType,
        generatedAt: entity.metadata?.generatedAt,
      });
    }

    throw new Error("Invalid landing page data");
  }

  public fromMarkdown(markdown: string): Partial<GeneratedContent> {
    const { content, metadata } = parseMarkdownWithFrontmatter(
      markdown,
      frontmatterSchema,
    );

    // Extract YAML from content
    const yamlMatch = content.match(/```yaml\n([\s\S]*?)\n```/);
    if (!yamlMatch?.[1]) {
      throw new Error("No YAML code block found in landing page content");
    }

    const yamlContent = yamlMatch[1];
    const referenceData = landingPageReferenceSchema.parse(
      yaml.load(yamlContent),
    );

    // Return as generated content with reference data
    return {
      contentType: metadata.contentType,
      data: referenceData,
    };
  }

  public extractMetadata(entity: GeneratedContent): Record<string, unknown> {
    const referenceResult = landingPageReferenceSchema.safeParse(entity.data);
    if (referenceResult.success) {
      return {
        title: referenceResult.data.title,
        tagline: referenceResult.data.tagline,
        isReference: true,
      };
    }

    const landingPageResult = landingPageSchema.safeParse(entity.data);
    if (landingPageResult.success) {
      return {
        title: landingPageResult.data.title,
        tagline: landingPageResult.data.tagline,
        hasSections: {
          hero: true,
          features: true,
          cta: true,
        },
      };
    }

    return {};
  }

  public parseFrontMatter<TFrontmatter>(
    markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    const { metadata } = parseMarkdownWithFrontmatter(markdown, schema);
    return metadata;
  }

  public generateFrontMatter(entity: GeneratedContent): string {
    return generateFrontmatter({
      contentType: entity.contentType,
      generatedAt: entity.metadata?.generatedAt,
    });
  }
}
