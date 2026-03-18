import { z } from "@brains/utils";
import {
  anchorProfileBodySchema,
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
} from "@brains/plugins";

/**
 * Personal profile fields — simpler than professional, no portfolio focus
 */
export const personalProfileExtension = z.object({
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
});

export const personalProfileSchema = anchorProfileBodySchema.extend(
  personalProfileExtension.shape,
);

export type PersonalProfile = z.infer<typeof personalProfileSchema>;

export class PersonalProfileParser {
  public parse(content: string): PersonalProfile {
    const { metadata, content: body } = parseMarkdownWithFrontmatter(
      content,
      personalProfileSchema,
    );
    if (body) {
      return { ...metadata, story: body };
    }
    return metadata;
  }

  public format(data: PersonalProfile): string {
    return generateMarkdownWithFrontmatter("", data);
  }
}
