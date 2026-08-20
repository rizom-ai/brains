import { z } from "@brains/sdk/entities";
import { fetchStyleGuide, formatVoiceGuidance } from "@brains/sdk/entities";
import type { EntityEvalDeclaration } from "@brains/sdk/entities";

const generateDeckEvalInputSchema = z.object({
  prompt: z.string(),
  event: z.string().optional(),
});

const generateDescriptionEvalInputSchema = z.object({
  title: z.string(),
  content: z.string(),
});

/**
 * Eval handlers, keyed by the `handler:` name their test cases use.
 *
 * These exercise the same prompts and templates generation does, so a
 * regression in either shows up here rather than only in production.
 */
export const deckEvals: EntityEvalDeclaration = {
  generateDeck: async (input, { ai, entities, template }) => {
    const parsed = generateDeckEvalInputSchema.parse(input);
    const voiceGuidance = formatVoiceGuidance(await fetchStyleGuide(entities));
    return ai.generate<{
      title: string;
      content: string;
      description: string;
    }>({
      prompt: `${parsed.prompt}${parsed.event ? `\n\nNote: This presentation is for "${parsed.event}".` : ""}`,
      templateName: template("generation"),
      representedIdentity: "anchor",
      ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
    });
  },
  generateDescription: async (input, { ai, template }) => {
    const parsed = generateDescriptionEvalInputSchema.parse(input);
    return ai.generate<{ description: string }>({
      prompt: `Title: ${parsed.title}\n\nContent:\n${parsed.content}`,
      templateName: template("description"),
      representedIdentity: "none",
    });
  },
};
