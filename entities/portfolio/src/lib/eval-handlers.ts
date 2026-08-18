import { z } from "@brains/utils/zod";
import { fetchStyleGuide, formatVoiceGuidance } from "@brains/contracts";
import type { EntityEvalDeclaration } from "@brains/plugins";
import { buildProjectGenerationPrompt } from "../handlers/generation-handler";

const generateProjectEvalInputSchema = z.object({
  prompt: z.string(),
  year: z.number(),
});

/**
 * Eval handlers, keyed by the `handler:` name their test cases use. These
 * run the same prompt generation does, so a drift in either surfaces here.
 */
export const projectEvals: EntityEvalDeclaration = {
  generateProject: async (input, { ai, entities }) => {
    const parsed = generateProjectEvalInputSchema.parse(input);
    const voiceGuidance = formatVoiceGuidance(await fetchStyleGuide(entities));
    return ai.generate<{
      title: string;
      description: string;
      context: string;
      problem: string;
      solution: string;
      outcome: string;
    }>({
      prompt: buildProjectGenerationPrompt(parsed),
      templateName: "portfolio:generation",
      representedIdentity: "anchor",
      ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
    });
  },
};
