import { z } from "@brains/utils";
import {
  anchorProfileBodySchema,
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
} from "@brains/plugins";

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

export const professionalProfileSchema = anchorProfileBodySchema.extend(
  professionalProfileExtension.shape,
);

/**
 * Professional profile type
 */
export type ProfessionalProfile = z.infer<typeof professionalProfileSchema>;

/**
 * Parser for professional profile content
 * Reads extended fields from the same profile.md entity
 */
export class ProfessionalProfileParser {
  /**
   * Parse professional profile from frontmatter markdown content
   * Story lives in the markdown body, not in frontmatter
   */
  public parse(content: string): ProfessionalProfile {
    const { metadata, content: body } = parseMarkdownWithFrontmatter(
      content,
      professionalProfileSchema,
    );
    if (body) {
      return { ...metadata, story: body };
    }
    return metadata;
  }

  /**
   * Format professional profile to frontmatter markdown
   */
  public format(data: ProfessionalProfile): string {
    return generateMarkdownWithFrontmatter("", data);
  }
}
