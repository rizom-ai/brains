import type {
  CreateExecutionContext,
  CreateInput,
} from "@brains/entity-service";
import { resolveEntityOrError } from "@brains/entity-service";
import type { Tool } from "@brains/mcp-service";
import { createTool } from "@brains/mcp-service";
import { setCoverImageId, slugify } from "@brains/utils";
import type { SystemServices } from "./types";
import {
  createInputSchema,
  deleteInputSchema,
  extractInputSchema,
  setCoverInputSchema,
  updateInputSchema,
} from "./schemas";
import {
  createSystemTool,
  getEntityDisplayLabel,
  hasStructuredFrontmatter,
  normalizeOptionalString,
  normalizeUpdateInput,
} from "./tool-helpers";

export function createEntityMutationTools(services: SystemServices): Tool[] {
  const { entityService, logger, jobs, entityRegistry } = services;

  return [
    createSystemTool(
      "create",
      "Create a new entity. Provide content for direct creation, a prompt for AI generation, or a url for URL-first flows.",
      createInputSchema,
      async (input, toolContext) => {
        const prompt = normalizeOptionalString(input.prompt);
        const content = normalizeOptionalString(input.content);
        const title = normalizeOptionalString(input.title);
        const url = normalizeOptionalString(input.url);
        const targetEntityType = normalizeOptionalString(
          input.targetEntityType,
        );
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
            const jobId = await jobs.enqueue(
              `${createInput.entityType}:generation`,
              {
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
            );
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
              error instanceof Error
                ? error.message
                : "Failed to create entity",
          };
        }
      },
      { visibility: "trusted" },
    ),

    createSystemTool(
      "delete",
      "Delete an entity. Requires confirmation.",
      deleteInputSchema,
      async (input) => {
        const resolved = await resolveEntityOrError(
          entityService,
          input.entityType,
          input.id,
          logger,
        );
        if (!resolved.ok) return { success: false, error: resolved.error };
        const { entity } = resolved;

        if (input.confirmed) {
          try {
            await entityService.deleteEntity(input.entityType, entity.id);
          } catch (error) {
            return {
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to delete entity",
            };
          }
          return { success: true, data: { deleted: entity.id } };
        }

        const label = getEntityDisplayLabel(entity);
        return {
          needsConfirmation: true,
          toolName: "system_delete",
          description: `Delete "${label}"?\n\nPreview:\n${entity.content.slice(0, 200)}`,
          args: { ...input, id: entity.id, confirmed: true },
        };
      },
      { visibility: "trusted" },
    ),

    createSystemTool(
      "update",
      "Update an entity's fields or content. Requires confirmation.",
      updateInputSchema,
      async (input) => {
        const resolved = await resolveEntityOrError(
          entityService,
          input.entityType,
          input.id,
          logger,
        );
        if (!resolved.ok) return { success: false, error: resolved.error };
        const { entity } = resolved;
        let normalizedInput = normalizeUpdateInput({
          ...(input.fields !== undefined ? { fields: input.fields } : {}),
          ...(input.content !== undefined ? { content: input.content } : {}),
        });

        const isBlankContentApprovalAttempt =
          normalizedInput.content?.trim().length === 0 &&
          normalizedInput.fields === undefined;

        const agentStatus = entity.metadata["status"];
        if (
          input.confirmed &&
          entity.entityType === "agent" &&
          (agentStatus === "discovered" || agentStatus === "approved") &&
          ((!normalizedInput.content && !normalizedInput.fields) ||
            isBlankContentApprovalAttempt)
        ) {
          normalizedInput = {
            fields: { status: "approved" },
          };
        }

        if (normalizedInput.content && normalizedInput.fields)
          return {
            success: false,
            error: "Provide either 'content' or 'fields', not both",
          };
        if (!normalizedInput.content && !normalizedInput.fields)
          return {
            success: false,
            error:
              "Provide 'content' (full replacement) or 'fields' (partial update)",
          };

        if (input.confirmed) {
          if (input.contentHash && entity.contentHash !== input.contentHash) {
            return {
              success: false,
              error:
                "Entity was modified since you reviewed the changes. Please try again.",
            };
          }

          if (normalizedInput.content !== undefined) {
            const trimmedContent = normalizedInput.content.trim();
            const frontmatterSchema =
              entityRegistry.getEffectiveFrontmatterSchema(entity.entityType);

            if (frontmatterSchema) {
              if (!trimmedContent) {
                return {
                  success: false,
                  error:
                    "Full content replacement cannot be empty for this entity type. Use 'fields' for partial updates.",
                };
              }

              try {
                entityRegistry
                  .getAdapter(entity.entityType)
                  .parseFrontMatter(normalizedInput.content, frontmatterSchema);
              } catch {
                return {
                  success: false,
                  error:
                    "Invalid content replacement for this entity type. Provide full markdown with valid frontmatter, or use 'fields' for partial updates.",
                };
              }
            }
          }

          const updated =
            normalizedInput.content !== undefined
              ? { ...entity, content: normalizedInput.content }
              : {
                  ...entity,
                  metadata: { ...entity.metadata, ...normalizedInput.fields },
                };
          try {
            await entityService.updateEntity(updated);
          } catch (error) {
            return {
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to update entity",
            };
          }
          return { success: true, data: { updated: entity.id } };
        }

        const label = getEntityDisplayLabel(entity);
        let diff: string;
        if (normalizedInput.fields) {
          diff = Object.entries(normalizedInput.fields)
            .map(
              ([key, val]) =>
                `${key}: ${String(entity.metadata[key] ?? "(empty)")} → ${String(val)}`,
            )
            .join("\n");
        } else {
          const oldLines = entity.content.split("\n");
          const newLines = (normalizedInput.content ?? "").split("\n");
          const diffLines: string[] = [];
          for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
            if ((oldLines[i] ?? "") !== (newLines[i] ?? "")) {
              if (oldLines[i]) diffLines.push(`- ${oldLines[i]}`);
              if (newLines[i]) diffLines.push(`+ ${newLines[i]}`);
            }
          }
          diff = diffLines.join("\n");
        }
        return {
          needsConfirmation: true,
          toolName: "system_update",
          description: `Update "${label}"?\n\nChanges:\n${diff}`,
          args: {
            ...input,
            ...normalizedInput,
            id: entity.id,
            confirmed: true,
            contentHash: entity.contentHash,
          },
        };
      },
      { visibility: "trusted" },
    ),

    createSystemTool(
      "extract",
      'Project derived entities from source content. Provide source for single, omit for batch. `mode: "rebuild"` is currently only supported for `entityType: "topic"` and requires confirmation; other entity types fall back to normal projection mode.',
      extractInputSchema,
      async (input, toolContext) => {
        const { entityType, source } = input;
        const requestedMode = input.mode ?? "derive";
        const rebuildRequested = requestedMode === "rebuild";
        const rebuildSupported = entityType === "topic" && !source;
        const appliedMode =
          rebuildRequested && rebuildSupported ? "rebuild" : "derive";

        if (!entityService.getEntityTypes().includes(entityType)) {
          return {
            success: false,
            error: `Unknown entity type: ${entityType}. Available types: ${entityService.getEntityTypes().join(", ")}`,
          };
        }

        if (rebuildRequested && rebuildSupported && !input.confirmed) {
          return {
            needsConfirmation: true,
            toolName: "system_extract",
            description:
              "Rebuild all derived topic entities from current source content?\n\nThis will delete existing topics and regenerate them from scratch.",
            args: {
              ...input,
              confirmed: true,
            },
          };
        }

        try {
          const data: {
            mode: "derive" | "rebuild" | "source";
            entityId?: string;
            entityType?: string;
          } = { mode: appliedMode };
          if (source) {
            for (const type of entityService.getEntityTypes()) {
              const found = await entityService.getEntity(type, source);
              if (found) {
                data.mode = "source";
                data.entityId = found.id;
                data.entityType = found.entityType;
                break;
              }
            }
            if (!data.entityId)
              return {
                success: false,
                error: `Source entity not found: ${source}`,
              };
          }

          const jobId = await jobs.enqueue(
            `${entityType}:project`,
            data,
            toolContext,
          );
          return {
            success: true,
            data: {
              status: "extracting",
              jobId,
              entityType,
              mode: appliedMode,
              ...(source && { source }),
            },
            ...(rebuildRequested && !rebuildSupported
              ? {
                  message:
                    source || entityType !== "topic"
                      ? `Rebuild is currently only supported for batch topic extraction. Ran normal projection mode for ${entityType} instead.`
                      : undefined,
                }
              : {}),
          };
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to queue extraction job",
          };
        }
      },
      { visibility: "trusted" },
    ),

    createTool(
      "system",
      "set-cover",
      "Set or remove cover image on an entity.",
      setCoverInputSchema,
      async (input) => {
        try {
          const resolved = await resolveEntityOrError(
            entityService,
            input.entityType,
            input.entityId,
            logger,
          );
          if (!resolved.ok) return { success: false, error: resolved.error };
          const { entity } = resolved;
          const adapter = services.entityRegistry.getAdapter(input.entityType);
          if (!adapter.supportsCoverImage)
            return {
              success: false,
              error: `Entity type '${input.entityType}' doesn't support cover images`,
            };
          if (input.imageId) {
            const image = await resolveEntityOrError(
              entityService,
              "image",
              input.imageId,
              logger,
              "Image",
            );
            if (!image.ok) return { success: false, error: image.error };
          }
          const updated = setCoverImageId(entity, input.imageId);
          await entityService.updateEntity(updated);
          return {
            success: true,
            data: {
              entityType: input.entityType,
              entityId: input.entityId,
              imageId: input.imageId,
            },
            message: input.imageId
              ? `Cover image set to '${input.imageId}' on ${input.entityType}/${input.entityId}`
              : `Cover image removed from ${input.entityType}/${input.entityId}`,
          };
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to set cover image",
          };
        }
      },
      { visibility: "trusted" },
    ),
  ];
}
