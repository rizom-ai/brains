import type {
  EntityDefinition,
  EntityEvalDeclaration,
} from "@brains/sdk/entities";
import { entityRuntime } from "@brains/sdk/internal/entity-runtime";
import { z } from "@brains/utils/zod";
import type { socialPostMetadataSchema } from "../schemas/social-post";

type SocialPostDefinition = EntityDefinition<
  "social-post",
  typeof socialPostMetadataSchema
>;

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

interface ProgressStep {
  progress: number;
  message?: string;
}

/**
 * The social posts' evals: the AI's post text alone, and the whole
 * generation, which must leave the post it reports in the store.
 */
export function socialPostEvals(
  socialPost: () => SocialPostDefinition,
): EntityEvalDeclaration {
  return {
    // Eval: test AI text generation only (fast, no entity persistence)
    generation: async (input, { ai }): Promise<{ content: string }> => {
      const parsed = generationInputSchema.parse(input);
      return ai.generate(
        {
          template: parsed.platform,
          prompt: parsed.content
            ? `Write a LinkedIn post to share this content:\n\n${parsed.content}`
            : (parsed.prompt ?? "Write a LinkedIn post"),
          representedIdentity: "anchor",
          voice: true,
        },
        z.object({ content: z.string() }),
      );
    },
    // Eval: run the full generation pipeline and verify entity persistence
    create: async (input, context): Promise<Record<string, unknown>> => {
      const parsed = createInputSchema.parse(input);
      const progressSteps: ProgressStep[] = [];
      const result = await entityRuntime(context).runGeneration(parsed, {
        onProgress: ({ progress, message }) => {
          progressSteps.push({
            progress,
            ...(message !== undefined && { message }),
          });
        },
      });
      const entityId =
        result.success && typeof result.entityId === "string"
          ? result.entityId
          : undefined;
      const entity = entityId
        ? await context.entities.get(socialPost(), entityId)
        : null;
      return {
        ...result,
        entityExists: entity !== null,
        entityPreview: entity?.content.slice(0, 300),
        progressSteps,
      };
    },
  };
}
