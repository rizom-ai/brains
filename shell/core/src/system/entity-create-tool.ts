import type {
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
      };

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
        if (interception.kind === "handled") return interception.result;
        createInput = interception.input;
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
                entityType: createInput.entityType,
                id,
                markdown: createInput.content,
              })
            : await entityService.createEntity({
                id,
                entityType: createInput.entityType,
                content: createInput.content ?? "",
                metadata: { title: createInput.title ?? id },
                created: new Date().toISOString(),
                updated: new Date().toISOString(),
              });
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
