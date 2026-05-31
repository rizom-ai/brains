import type {
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
  EntityPluginContext,
  EntityTypeConfig,
  JobHandler,
  Plugin,
} from "@brains/plugins";
import { EntityPlugin, resolveEntityOrError } from "@brains/plugins";
import { slugify, z } from "@brains/utils";
import { imageSchema, imageAdapter, type Image } from "@brains/image";
import { ImageGenerationJobHandler } from "./handlers/image-generation-handler";
import packageJson from "../package.json";

const imageConfigSchema = z.object({
  defaultAspectRatio: z
    .enum(["1:1", "16:9", "9:16", "4:3", "3:4"])
    .default("16:9")
    .describe("Default aspect ratio for generated images"),
});

type ImageConfig = z.infer<typeof imageConfigSchema>;

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

function isDataUrl(value: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value.trim());
}

function getImageGenerationPrompt(input: CreateInput): string | undefined {
  const prompt = normalizeText(input.prompt);
  if (prompt) return prompt;

  const content = normalizeText(input.content);
  if (content && !isDataUrl(content)) return content;

  return undefined;
}

function getPredictedImageId(input: {
  prompt: string;
  title?: string;
  targetEntityId?: string;
}): string {
  const title =
    normalizeText(input.title) ??
    (input.targetEntityId
      ? `cover-${input.targetEntityId}`
      : input.prompt.slice(0, 60).trim());
  return slugify(title);
}

/**
 * Image EntityPlugin — manages image entities with AI generation.
 *
 * Zero tools. Image operations go through:
 * - system_create { entityType: "image", content: dataUrl } — upload
 * - system_create { entityType: "image", prompt: "..." } — AI generation
 * - system_update { fields: { coverImageId } } — set cover image references
 */
export class ImagePlugin extends EntityPlugin<Image, ImageConfig> {
  readonly entityType = imageAdapter.entityType;
  readonly schema = imageSchema;
  readonly adapter = imageAdapter;

  constructor(config: Partial<ImageConfig> = {}) {
    super("image", packageJson, config, imageConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return { embeddable: false };
  }

  protected override async interceptCreate(
    input: CreateInput,
    _executionContext: CreateExecutionContext,
    context: EntityPluginContext,
  ): Promise<CreateInterceptionResult> {
    const prompt = getImageGenerationPrompt(input);

    if (!input.targetEntityType || !input.targetEntityId) {
      if (!prompt) return { kind: "continue", input };

      const jobId = await context.jobs.enqueue({
        type: "image-generate",
        data: {
          prompt,
          ...(input.title && { title: input.title }),
        },
      });

      return {
        kind: "handled",
        result: {
          success: true,
          data: {
            entityId: getPredictedImageId({
              prompt,
              ...(input.title && { title: input.title }),
            }),
            status: "generating",
            jobId,
          },
        },
      };
    }

    const resolved = await resolveEntityOrError(
      context.entityService,
      input.targetEntityType,
      input.targetEntityId,
      this.logger,
      "Target entity",
    );

    if (!resolved.ok) {
      return {
        kind: "handled",
        result: { success: false, error: resolved.error },
      };
    }

    if (!prompt) {
      return {
        kind: "continue",
        input: { ...input, targetEntityId: resolved.entity.id },
      };
    }

    const jobId = await context.jobs.enqueue({
      type: "image-generate",
      data: {
        prompt,
        ...(input.title && { title: input.title }),
        targetEntityType: input.targetEntityType,
        targetEntityId: resolved.entity.id,
        entityTitle:
          typeof resolved.entity.metadata["title"] === "string"
            ? resolved.entity.metadata["title"]
            : resolved.entity.id,
        entityContent: resolved.entity.content,
      },
    });

    return {
      kind: "handled",
      result: {
        success: true,
        data: {
          entityId: getPredictedImageId({
            prompt,
            ...(input.title && { title: input.title }),
            targetEntityId: resolved.entity.id,
          }),
          status: "generating",
          jobId,
        },
      },
    };
  }

  protected override createGenerationHandler(
    context: EntityPluginContext,
  ): JobHandler {
    return new ImageGenerationJobHandler(context, this.logger);
  }

  /**
   * Also register the legacy "image-generate" handler name for backward
   * compatibility — existing enqueued jobs use this type.
   */
  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    const handler = new ImageGenerationJobHandler(context, this.logger);
    context.jobs.registerHandler("image-generate", handler);
  }
}

export function imagePlugin(config?: Partial<ImageConfig>): Plugin {
  return new ImagePlugin(config);
}
