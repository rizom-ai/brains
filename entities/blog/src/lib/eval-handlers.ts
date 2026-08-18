import type {
  EntityEvalDeclaration,
  EntityPluginContext,
} from "@brains/plugins";
import { fetchStyleGuide, formatVoiceGuidance } from "@brains/contracts";
import { z } from "@brains/utils/zod";

const generatePostInputSchema = z.object({
  prompt: z.string(),
  seriesName: z.string().optional(),
});

const generateExcerptInputSchema = z.object({
  title: z.string(),
  content: z.string(),
});

type GeneratePostInput = z.output<typeof generatePostInputSchema>;
type GenerateExcerptInput = z.output<typeof generateExcerptInputSchema>;

export function registerEvalHandlers(context: EntityPluginContext): void {
  context.eval.registerHandler("generatePost", async (input: unknown) => {
    const parsed: GeneratePostInput = generatePostInputSchema.parse(input);
    const generationPrompt = `${parsed.prompt}${parsed.seriesName ? `\n\nNote: This is part of a series called "${parsed.seriesName}".` : ""}`;

    const voiceGuidance = formatVoiceGuidance(
      await fetchStyleGuide(context.entityService),
    );
    return context.ai.generate<{
      title: string;
      content: string;
      excerpt: string;
    }>({
      prompt: generationPrompt,
      templateName: "blog:generation",
      representedIdentity: "anchor",
      ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
    });
  });

  context.eval.registerHandler("generateExcerpt", async (input: unknown) => {
    const parsed: GenerateExcerptInput =
      generateExcerptInputSchema.parse(input);

    return context.ai.generate<{
      excerpt: string;
    }>({
      prompt: `Title: ${parsed.title}\n\nContent:\n${parsed.content}`,
      templateName: "blog:excerpt",
      representedIdentity: "none",
    });
  });
}

/**
 * Eval handlers, keyed by the `handler:` name their test cases use. These
 * run the same prompts and templates generation does, so a drift in either
 * surfaces here rather than only in production.
 */
export const blogEvals: EntityEvalDeclaration = {
  generatePost: async (input, { ai, entities }) => {
    const parsed = generatePostInputSchema.parse(input);
    const voiceGuidance = formatVoiceGuidance(await fetchStyleGuide(entities));
    return ai.generate<{ title: string; content: string; excerpt: string }>({
      prompt: `${parsed.prompt}${parsed.seriesName ? `\n\nNote: This is part of a series called "${parsed.seriesName}".` : ""}`,
      templateName: "blog:generation",
      representedIdentity: "anchor",
      ...(voiceGuidance && { styleGuide: { voice: voiceGuidance } }),
    });
  },
  generateExcerpt: async (input, { ai }) => {
    const parsed = generateExcerptInputSchema.parse(input);
    return ai.generate<{ excerpt: string }>({
      prompt: `Title: ${parsed.title}\n\nContent:\n${parsed.content}`,
      templateName: "blog:excerpt",
      representedIdentity: "none",
    });
  },
};
