import type { EntityEvalDeclaration } from "@brains/sdk/entities";
import { z } from "@brains/utils/zod";
import {
  buildProjectGenerationPrompt,
  generatedProjectContentSchema,
} from "../handlers/generation-handler";

const generateProjectEvalInputSchema = z.object({
  prompt: z.string(),
  year: z.number(),
});

/** The portfolio's eval: a project generated as the anchor, in the brain's voice. */
export const projectEvals: EntityEvalDeclaration = {
  generateProject: async (input, { ai }) =>
    ai.generate(
      {
        template: "generation",
        prompt: buildProjectGenerationPrompt(
          generateProjectEvalInputSchema.parse(input),
        ),
        representedIdentity: "anchor",
        voice: true,
      },
      generatedProjectContentSchema,
    ),
};
