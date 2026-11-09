import type { EntityGenerationContext } from "@brains/sdk/entities";

/** Generation through a template the deck declares. */
export type DeckGenerate = EntityGenerationContext<unknown>["ai"]["generate"];
import { z } from "@brains/utils/zod";

/** Shape the deck description template returns. */
export const generatedDeckDescriptionSchema: z.ZodObject<{
  description: z.ZodString;
}> = z.object({ description: z.string() });

/**
 * A short card description for a deck, written from its slides in the
 * brain's voice through the deck's description template.
 */
export async function describeDeck(
  generate: DeckGenerate,
  deck: { title: string; content: string },
): Promise<string> {
  const { description } = await generate(
    {
      template: "description",
      prompt: `Title: ${deck.title}\n\nContent:\n${deck.content}`,
      representedIdentity: "none",
      voice: true,
    },
    generatedDeckDescriptionSchema,
  );
  return description;
}
