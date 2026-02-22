import type { ServicePluginContext } from "@brains/plugins";
import { z } from "@brains/utils";

const generationInputSchema = z.object({
  prompt: z.string().optional(),
  content: z.string().optional(),
  platform: z.enum(["linkedin"]).default("linkedin"),
});

export function registerEvalHandlers(context: ServicePluginContext): void {
  context.eval.registerHandler("generation", async (input: unknown) => {
    const parsed = generationInputSchema.parse(input);

    const generationPrompt = parsed.content
      ? `Create an engaging LinkedIn post to share this content:\n\n${parsed.content}`
      : (parsed.prompt ?? "Write an engaging LinkedIn post");

    return context.ai.generate<{
      content: string;
    }>({
      prompt: generationPrompt,
      templateName: `social-media:${parsed.platform}`,
    });
  });
}
