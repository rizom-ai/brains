import type { EntityPluginContext } from "@brains/plugins";
import { fetchStyleGuide, formatVoiceGuidance } from "@brains/contracts";
import { z } from "@brains/utils/zod";

/** Shape the deck description template returns. */
export const generatedDeckDescriptionSchema: z.ZodObject<{
  description: z.ZodString;
}> = z.object({ description: z.string() });

/** A short card description for a deck, written from its slides in the brain's voice. */
export async function describeDeck(
  context: Pick<EntityPluginContext, "ai" | "entityService">,
  deck: { title: string; content: string },
): Promise<string> {
  const voiceGuidance = formatVoiceGuidance(
    await fetchStyleGuide(context.entityService),
  );
  const { description } = await context.ai.generate(
    {
      prompt: `Title: ${deck.title}\n\nContent:\n${deck.content}`,
      templateName: "decks:description",
      representedIdentity: "none",
      ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
    },
    generatedDeckDescriptionSchema,
  );
  return description;
}
