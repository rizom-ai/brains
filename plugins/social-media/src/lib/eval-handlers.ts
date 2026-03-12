import type { ServicePluginContext } from "@brains/plugins";
import { z, ProgressReporter } from "@brains/utils";
import { GenerationJobHandler } from "../handlers/generationHandler";

const generationInputSchema = z.object({
  prompt: z.string().optional(),
  content: z.string().optional(),
  platform: z.enum(["linkedin"]).default("linkedin"),
});

const createInputSchema = z.object({
  prompt: z.string().optional(),
  content: z.string().optional(),
  title: z.string().optional(),
  platform: z.enum(["linkedin"]).optional(),
});

export function registerEvalHandlers(context: ServicePluginContext): void {
  // Eval: test AI text generation only (fast, no entity persistence)
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

  // Eval: run the full generation pipeline and verify entity persistence
  context.eval.registerHandler("create", async (input: unknown) => {
    const parsed = createInputSchema.parse(input);

    const progressSteps: Array<{ progress: number; message?: string }> = [];
    const reporter = ProgressReporter.from(async (n) => {
      const step: { progress: number; message?: string } = {
        progress: n.progress,
      };
      if (n.message !== undefined) step.message = n.message;
      progressSteps.push(step);
    });
    if (!reporter) throw new Error("Failed to create progress reporter");

    const handler = new GenerationJobHandler(context.logger, context);
    const result = await handler.process(
      parsed,
      `eval-${Date.now()}`,
      reporter,
    );

    // Verify entity was actually persisted when the handler reports success
    let entityExists = false;
    let entityPreview: string | undefined;
    if (result.success && result.entityId) {
      const entity = await context.entityService.getEntity(
        "social-post",
        result.entityId,
      );
      entityExists = !!entity;
      entityPreview = entity?.content.slice(0, 300);
    }

    return {
      ...result,
      entityExists,
      entityPreview,
      progressSteps,
    };
  });
}
