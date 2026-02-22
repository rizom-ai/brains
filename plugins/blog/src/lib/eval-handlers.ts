import type { ServicePluginContext } from "@brains/plugins";
import { z } from "@brains/utils";

const generatePostInputSchema = z.object({
  prompt: z.string(),
  seriesName: z.string().optional(),
});

const generateExcerptInputSchema = z.object({
  title: z.string(),
  content: z.string(),
});

export function registerEvalHandlers(context: ServicePluginContext): void {
  context.eval.registerHandler("generatePost", async (input: unknown) => {
    const parsed = generatePostInputSchema.parse(input);
    const generationPrompt = `${parsed.prompt}${parsed.seriesName ? `\n\nNote: This is part of a series called "${parsed.seriesName}".` : ""}`;

    return context.ai.generate<{
      title: string;
      content: string;
      excerpt: string;
    }>({
      prompt: generationPrompt,
      templateName: "blog:generation",
    });
  });

  context.eval.registerHandler("generateExcerpt", async (input: unknown) => {
    const parsed = generateExcerptInputSchema.parse(input);

    return context.ai.generate<{
      excerpt: string;
    }>({
      prompt: `Title: ${parsed.title}\n\nContent:\n${parsed.content}`,
      templateName: "blog:excerpt",
    });
  });
}
