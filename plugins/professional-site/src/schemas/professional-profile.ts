import { z, StructuredContentFormatter } from "@brains/utils";
import {
  profileBodySchema,
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
} from "@brains/plugins";

/**
 * Professional profile schema - extends base profile with professional fields
 * These fields are specific to professional/personal branding sites
 */
/**
 * Professional-specific fields that extend the base profile schema
 * Used both to build the full schema and to register as a CMS extension
 */
export const professionalProfileExtension = z.object({
  tagline: z
    .string()
    .optional()
    .describe("Short, punchy one-liner for homepage"),
  intro: z
    .string()
    .optional()
    .describe("Optional longer introduction for homepage"),
  story: z
    .string()
    .optional()
    .describe("Extended bio/narrative (multi-paragraph markdown)"),
  expertise: z
    .array(z.string())
    .optional()
    .describe("Skills, domains, areas of focus"),
  currentFocus: z
    .string()
    .optional()
    .describe("What you're currently working on"),
  availability: z
    .string()
    .optional()
    .describe("What you're open to (consulting, speaking, etc.)"),
});

export const professionalProfileSchema = profileBodySchema.extend(
  professionalProfileExtension.shape,
);

/**
 * Professional profile type
 */
export type ProfessionalProfile = z.infer<typeof professionalProfileSchema>;

/**
 * Parser for professional profile content
 * Reads extended fields from the same profile.md entity
 * Supports both frontmatter and legacy structured content formats
 */
export class ProfessionalProfileParser {
  private createFormatter(): StructuredContentFormatter<ProfessionalProfile> {
    return new StructuredContentFormatter(professionalProfileSchema, {
      title: "Profile",
      mappings: [
        // Base fields
        { key: "name", label: "Name", type: "string" },
        { key: "description", label: "Description", type: "string" },
        { key: "avatar", label: "Avatar", type: "string" },
        { key: "website", label: "Website", type: "string" },
        { key: "email", label: "Email", type: "string" },
        {
          key: "socialLinks",
          label: "Social Links",
          type: "array",
          itemType: "object",
          itemMappings: [
            { key: "platform", label: "Platform", type: "string" },
            { key: "url", label: "URL", type: "string" },
            { key: "label", label: "Label", type: "string" },
          ],
        },
        // Professional fields
        { key: "tagline", label: "Tagline", type: "string" },
        { key: "intro", label: "Intro", type: "string" },
        { key: "story", label: "Story", type: "string" },
        {
          key: "expertise",
          label: "Expertise",
          type: "array",
          itemType: "string",
        },
        { key: "currentFocus", label: "Current Focus", type: "string" },
        { key: "availability", label: "Availability", type: "string" },
      ],
    });
  }

  /**
   * Parse professional profile from markdown content
   * Handles both frontmatter and legacy structured content formats
   */
  public parse(content: string): ProfessionalProfile {
    if (content.startsWith("---")) {
      const { metadata } = parseMarkdownWithFrontmatter(
        content,
        professionalProfileSchema,
      );
      return metadata;
    }
    // Legacy: structured content format
    const formatter = this.createFormatter();
    return formatter.parse(content);
  }

  /**
   * Format professional profile to frontmatter markdown
   */
  public format(data: ProfessionalProfile): string {
    return generateMarkdownWithFrontmatter("", data);
  }
}
