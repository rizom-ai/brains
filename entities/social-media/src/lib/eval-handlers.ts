import type { EntityEvalDeclaration } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { getTemplateName } from "../templates";

const generationInputSchema = z.object({
  prompt: z.string().optional(),
  content: z.string().optional(),
  platform: z.enum(["linkedin"]).default("linkedin"),
});

/**
 * Evals for social post writing.
 *
 * Only the text-generation half: the `create` eval used to run the whole
 * job and then read the entity back, which a declaration cannot do — a
 * generation returns content and the runtime is what persists it. The
 * persistence half is covered by the runtime's own lifecycle tests.
 */
export const socialPostEvals: EntityEvalDeclaration = {
  generation: async (input, { ai }) => {
    const parsed = generationInputSchema.parse(input);
    const prompt = parsed.content
      ? `Create an engaging LinkedIn post to share this content:\n\n${parsed.content}`
      : (parsed.prompt ?? "Write an engaging LinkedIn post");

    return ai.generate<{ content: string }>({
      prompt,
      templateName: getTemplateName(parsed.platform),
    });
  },
};
