import type {
  CreateCoverImageInput,
  CreateExecutionContext,
  CreateInput,
} from "@brains/entity-service";
import type { Tool } from "@brains/mcp-service";
import { slugify } from "@brains/utils";
import { createInputSchema } from "./schemas";
import type { SystemServices } from "./types";
import {
  createSystemTool,
  hasStructuredFrontmatter,
  normalizeOptionalString,
} from "./tool-helpers";

interface NormalizedCoverImageInput {
  generate: true;
  prompt?: string;
}

function normalizeCoverImageInput(
  coverImage: boolean | CreateCoverImageInput | undefined,
): NormalizedCoverImageInput | undefined {
  if (coverImage === undefined || coverImage === false) return undefined;
  if (coverImage === true) return { generate: true };

  if (coverImage.generate === false) return undefined;
  const prompt = normalizeOptionalString(coverImage.prompt);
  return {
    generate: true,
    ...(prompt && { prompt }),
  };
}

function buildCoverImagePrompt(
  coverImage: NormalizedCoverImageInput,
  title: string,
): string {
  return coverImage.prompt ?? `Editorial cover image for: ${title}. `;
}

async function enqueueCoverImageGeneration(
  services: SystemServices,
  input: {
    entityType: string;
    entityId: string;
    title: string;
    content?: string;
    coverImage: NormalizedCoverImageInput;
  },
  toolContext: Parameters<Tool["handler"]>[1],
): Promise<string> {
  return services.jobs.enqueue({
    type: "image:image-generate",
    data: {
      prompt: buildCoverImagePrompt(input.coverImage, input.title),
      title: `${input.title} Cover`,
      aspectRatio: "16:9",
      targetEntityType: input.entityType,
      targetEntityId: input.entityId,
      entityTitle: input.title,
      ...(input.content && { entityContent: input.content }),
    },
    toolContext,
  });
}

function validateCoverImageSupport(
  services: SystemServices,
  entityType: string,
): { success: false; error: string } | undefined {
  const adapter = services.entityRegistry.getAdapter(entityType);
  if (adapter.supportsCoverImage) return undefined;
  return {
    success: false,
    error: `Entity type '${entityType}' doesn't support cover images`,
  };
}

export function createEntityCreateTool(services: SystemServices): Tool {
  const { entityService, jobs, entityRegistry } = services;

  return createSystemTool(
    "create",
    "Create a new entity. Provide content for direct creation, a prompt for AI generation, or a url for URL-first flows.",
    createInputSchema,
    async (input, toolContext) => {
      const prompt = normalizeOptionalString(input.prompt);
      const content = normalizeOptionalString(input.content);
      const title = normalizeOptionalString(input.title);
      const url = normalizeOptionalString(input.url);
      const targetEntityType = normalizeOptionalString(input.targetEntityType);
      const targetEntityId = normalizeOptionalString(input.targetEntityId);
      let coverImage = normalizeCoverImageInput(input.coverImage);

      if (!!targetEntityType !== !!targetEntityId)
        return {
          success: false,
          error:
            "Provide both 'targetEntityType' and 'targetEntityId' together, or omit both.",
        };

      if (!content && !prompt && !url)
        return {
          success: false,
          error:
            "Provide 'content' (direct create), 'prompt' (AI generation), or 'url' (URL-first create), or a supported combination.",
        };

      let createInput: CreateInput = {
        entityType: input.entityType,
        ...(prompt && { prompt }),
        ...(title && { title }),
        ...(content && { content }),
        ...(url && { url }),
        ...(targetEntityType && { targetEntityType }),
        ...(targetEntityId && { targetEntityId }),
        ...(coverImage && { coverImage }),
      };

      if (coverImage) {
        const validationError = validateCoverImageSupport(
          services,
          createInput.entityType,
        );
        if (validationError) return validationError;
      }

      const interceptor = services.entityRegistry.getCreateInterceptor(
        createInput.entityType,
      );
      if (interceptor) {
        const executionContext: CreateExecutionContext = {
          interfaceType: toolContext.interfaceType,
          userId: toolContext.userId,
          ...(toolContext.channelId && { channelId: toolContext.channelId }),
          ...(toolContext.channelName && {
            channelName: toolContext.channelName,
          }),
        };
        const interception = await interceptor(createInput, executionContext);
        if (interception.kind === "handled") {
          if (
            coverImage &&
            interception.result.success &&
            interception.result.data.status === "created" &&
            interception.result.data.entityId
          ) {
            await enqueueCoverImageGeneration(
              services,
              {
                entityType: createInput.entityType,
                entityId: interception.result.data.entityId,
                title: createInput.title ?? interception.result.data.entityId,
                ...(createInput.content && { content: createInput.content }),
                coverImage,
              },
              toolContext,
            );
          }
          return interception.result;
        }
        createInput = interception.input;
        coverImage = normalizeCoverImageInput(createInput.coverImage);
        if (coverImage) {
          const validationError = validateCoverImageSupport(
            services,
            createInput.entityType,
          );
          if (validationError) return validationError;
          createInput = { ...createInput, coverImage };
        }
      }

      if (!createInput.content && !createInput.prompt) {
        return {
          success: false,
          error:
            "URL-only creation is supported only for entity types that explicitly handle it. Provide 'content' or 'prompt' for this entity type.",
        };
      }

      if (createInput.prompt) {
        try {
          const jobId = await jobs.enqueue({
            type: `${createInput.entityType}:generation`,
            data: {
              prompt: createInput.prompt,
              ...(createInput.title && { title: createInput.title }),
              ...(createInput.content && { content: createInput.content }),
              ...(createInput.targetEntityType && {
                targetEntityType: createInput.targetEntityType,
              }),
              ...(createInput.targetEntityId && {
                targetEntityId: createInput.targetEntityId,
              }),
              ...(coverImage && { coverImage }),
            },
            toolContext,
          });
          return { success: true, data: { status: "generating", jobId } };
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to queue generation job",
          };
        }
      }

      const id = slugify(
        createInput.title ?? `${createInput.entityType}-${Date.now()}`,
      );
      const frontmatterSchema = entityRegistry.getEffectiveFrontmatterSchema(
        createInput.entityType,
      );
      try {
        const result =
          createInput.content && hasStructuredFrontmatter(frontmatterSchema)
            ? await entityService.createEntityFromMarkdown({
                input: {
                  entityType: createInput.entityType,
                  id,
                  markdown: createInput.content,
                },
              })
            : await entityService.createEntity({
                entity: {
                  id,
                  entityType: createInput.entityType,
                  content: createInput.content ?? "",
                  metadata: { title: createInput.title ?? id },
                  created: new Date().toISOString(),
                  updated: new Date().toISOString(),
                },
              });
        if (coverImage) {
          await enqueueCoverImageGeneration(
            services,
            {
              entityType: createInput.entityType,
              entityId: result.entityId,
              title: createInput.title ?? result.entityId,
              ...(createInput.content && { content: createInput.content }),
              coverImage,
            },
            toolContext,
          );
        }

        return {
          success: true,
          data: { entityId: result.entityId, status: "created" },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to create entity",
        };
      }
    },
    { visibility: "trusted" },
  );
}
