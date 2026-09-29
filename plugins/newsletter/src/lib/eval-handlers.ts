import {
  fetchVoiceGuidance,
  z,
  type EntityEvalDeclaration,
} from "@brains/sdk/entities";
import { generatedNewsletterSchema } from "../handlers/generation";

const generationInputSchema = z.object({
  prompt: z.string().optional(),
  content: z.string().optional(),
});

/**
 * Evals for newsletter writing: the text-generation half, in the anchor's
 * voice, against the same template generation uses.
 */
export const newsletterEvals: EntityEvalDeclaration = {
  generation: async (input, { ai, entities, template }) => {
    const parsed = generationInputSchema.parse(input);
    const prompt = parsed.content
      ? `Create an engaging newsletter based on this content:\n\n${parsed.content}`
      : (parsed.prompt ?? "Write an engaging newsletter");
    const voiceGuidance = await fetchVoiceGuidance(entities);

    return ai.generate(
      {
        prompt,
        templateName: template("generation"),
        representedIdentity: "anchor",
        ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
      },
      generatedNewsletterSchema,
    );
  },
};
