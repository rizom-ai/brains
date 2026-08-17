import { z } from "@brains/utils/zod";
import { fetchStyleGuide, formatVoiceGuidance } from "@brains/contracts";
import type { EntityEvalDeclaration } from "@brains/plugins";

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
  generateDeck: async (input, { ai, entities }) => {
    const parsed = generateDeckEvalInputSchema.parse(input);
    const voiceGuidance = formatVoiceGuidance(await fetchStyleGuide(entities));
    return ai.generate<{
      title: string;
      content: string;
      description: string;
    }>({
      prompt: `${parsed.prompt}${parsed.event ? `\n\nNote: This presentation is for "${parsed.event}".` : ""}`,
      templateName: "decks:generation",
      representedIdentity: "anchor",
      ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
    });
  },
  generateDescription: async (input, { ai }) => {
    const parsed = generateDescriptionEvalInputSchema.parse(input);
    return ai.generate<{ description: string }>({
      prompt: `Title: ${parsed.title}\n\nContent:\n${parsed.content}`,
      templateName: "decks:description",
      representedIdentity: "none",
    });
  },
};
