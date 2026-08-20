import type { EntityEvalDeclaration } from "@brains/sdk/entities";
import { fetchStyleGuide, formatVoiceGuidance } from "@brains/sdk/entities";
import { z } from "@brains/sdk/entities";

const generatePostInputSchema = z.object({
  prompt: z.string(),
  seriesName: z.string().optional(),
});

const generateExcerptInputSchema = z.object({
  title: z.string(),
  content: z.string(),
});

/**
 * Eval handlers, keyed by the `handler:` name their test cases use. These
 * run the same prompts and templates generation does, so a drift in either
 * surfaces here rather than only in production.
 */
export const blogEvals: EntityEvalDeclaration = {
  generatePost: async (input, { ai, entities, template }) => {
    const parsed = generatePostInputSchema.parse(input);
    const voiceGuidance = formatVoiceGuidance(await fetchStyleGuide(entities));
    return ai.generate<{ title: string; content: string; excerpt: string }>({
      prompt: `${parsed.prompt}${parsed.seriesName ? `\n\nNote: This is part of a series called "${parsed.seriesName}".` : ""}`,
      templateName: template("generation"),
      representedIdentity: "anchor",
      ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
    });
  },
  generateExcerpt: async (input, { ai, template }) => {
    const parsed = generateExcerptInputSchema.parse(input);
    return ai.generate<{ excerpt: string }>({
      prompt: `Title: ${parsed.title}\n\nContent:\n${parsed.content}`,
      templateName: template("excerpt"),
      representedIdentity: "none",
    });
  },
};
