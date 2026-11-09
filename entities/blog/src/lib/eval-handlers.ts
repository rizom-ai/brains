import type { EntityEvalDeclaration } from "@brains/sdk/entities";
import { z } from "@brains/utils/zod";
import { generatedBlogPostSchema, generatedExcerptSchema } from "../generation";

const generatePostInputSchema = z.object({
  prompt: z.string(),
  seriesName: z.string().optional(),
});

const generateExcerptInputSchema = z.object({
  title: z.string(),
  content: z.string(),
});

/**
 * The blog's evals: a post generated from a prompt as the anchor, and an
 * excerpt written from a post, both in the brain's voice.
 */
export const postEvals: EntityEvalDeclaration = {
  generatePost: async (input, { ai }) => {
    const parsed = generatePostInputSchema.parse(input);
    return ai.generate(
      {
        template: "generation",
        prompt: `${parsed.prompt}${parsed.seriesName ? `\n\nNote: This is part of a series called "${parsed.seriesName}".` : ""}`,
        representedIdentity: "anchor",
        voice: true,
      },
      generatedBlogPostSchema,
    );
  },
  generateExcerpt: async (input, { ai }) => {
    const parsed = generateExcerptInputSchema.parse(input);
    return ai.generate(
      {
        template: "excerpt",
        prompt: `Title: ${parsed.title}\n\nContent:\n${parsed.content}`,
        representedIdentity: "none",
        voice: true,
      },
      generatedExcerptSchema,
    );
  },
};
