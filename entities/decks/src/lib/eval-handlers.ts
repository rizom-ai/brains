import type { EntityEvalDeclaration } from "@brains/sdk/entities";
import { z } from "@brains/utils/zod";
import { describeDeck } from "./describe-deck";
import { generatedDeckSchema } from "../handlers/deckGenerationJobHandler";

const generateDeckEvalInputSchema = z.object({
  prompt: z.string(),
  event: z.string().optional(),
});

const generateDescriptionEvalInputSchema = z.object({
  title: z.string(),
  content: z.string(),
});

/**
 * The decks' evals: a deck generated from a prompt as the anchor, and a
 * description written from a deck's slides, both in the brain's voice.
 */
export const deckEvals: EntityEvalDeclaration = {
  generateDeck: async (input, { ai }) => {
    const parsed = generateDeckEvalInputSchema.parse(input);
    return ai.generate(
      {
        template: "generation",
        prompt: `${parsed.prompt}${parsed.event ? `\n\nNote: This presentation is for "${parsed.event}".` : ""}`,
        representedIdentity: "anchor",
        voice: true,
      },
      generatedDeckSchema,
    );
  },
  generateDescription: async (input, { ai }) => {
    const parsed = generateDescriptionEvalInputSchema.parse(input);
    return {
      description: await describeDeck(ai.generate, parsed),
    };
  },
};
