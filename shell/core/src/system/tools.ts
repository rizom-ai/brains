import type { Tool, ToolResponse, ToolContext } from "@brains/mcp-service";
import { createTool } from "@brains/mcp-service";
import { resolveEntityOrError } from "@brains/entity-service";
import { z, slugify, setCoverImageId, getErrorMessage } from "@brains/utils";
import type {
  BaseEntity,
  CreateExecutionContext,
  CreateInput,
} from "@brains/entity-service";
import type { SystemServices } from "./types";

const PLUGIN_ID = "system";

/**
 * Like createTool but allows ToolResponse (incl. confirmations) as return type.
 * Used for system tools that need confirmation flows.
 */
function createSystemTool<TSchema extends z.ZodObject<z.ZodRawShape>>(
  name: string,
  description: string,
  inputSchema: TSchema,
  handler: (
    input: z.infer<TSchema>,
    context: ToolContext,
  ) => Promise<ToolResponse>,
  options: { visibility?: Tool["visibility"] } = {},
): Tool {
  const { visibility = "anchor" } = options;
  return {
    name: `${PLUGIN_ID}_${name}`,
    description,
    inputSchema: inputSchema.shape,
    handler: async (input, context): Promise<ToolResponse> => {
      const parseResult = inputSchema.safeParse(input);
      if (!parseResult.success) {
        return {
          success: false,
          error: `Invalid input: ${parseResult.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
        };
      }
      try {
        return await handler(parseResult.data, context);
      } catch (error) {
        return { success: false, error: getErrorMessage(error) };
      }
    },
    visibility,
  };
}
import {
  searchInputSchema,
  getInputSchema,
  listInputSchema,
  createInputSchema,
  updateInputSchema,
  deleteInputSchema,
  extractInputSchema,
  setCoverInputSchema,
  checkJobStatusInputSchema,
  getConversationInputSchema,
  listConversationsInputSchema,
  getMessagesInputSchema,
  insightsInputSchema,
} from "./schemas";

function sanitizeEntity<T extends BaseEntity>(entity: T): T {
  if (entity.entityType === "image" && entity.content.startsWith("data:")) {
    return {
      ...entity,
      content: "[binary image data — use metadata for image info]",
    };
  }
  return entity;
}

function normalizeOptionalString(
  value: string | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeUpdateInput(input: {
  fields?: Record<string, unknown>;
  content?: string;
}): {
  fields?: Record<string, unknown>;
  content?: string;
} {
  if (input.fields) {
    return { fields: input.fields };
  }

  if (!input.content) {
    return {};
  }

  try {
    const parsed = JSON.parse(input.content) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      if (
        "fields" in parsed &&
        typeof parsed.fields === "object" &&
        parsed.fields !== null &&
        !Array.isArray(parsed.fields)
      ) {
        return {
          fields: parsed.fields as Record<string, unknown>,
        };
      }

      return {
        fields: parsed as Record<string, unknown>,
      };
    }
  } catch {
    // Not JSON — treat as full content replacement.
  }

  return { content: input.content };
}

export function createSystemTools(services: SystemServices): Tool[] {
  const { entityService, conversationService, logger, jobs, entityRegistry } =
    services;

  return [
    // ── Search ──
    createTool(
      "system",
      "search",
      "Search entities using semantic search. Optionally filter by entity type.",
      searchInputSchema,
      async (input) => ({
        success: true,
        data: {
          results: (
            await entityService.search(input.query, {
              limit: input.limit ?? services.searchLimit,
              ...(input.entityType && { types: [input.entityType] }),
            })
          ).map((r) => ({ ...r, entity: sanitizeEntity(r.entity) })),
        },
      }),
      {
        visibility: "public",
        cli: {
          name: "search",
        },
      },
    ),

    // ── Get ──
    createTool(
      "system",
      "get",
      "Retrieve a specific entity by type and identifier (ID, slug, or title).",
      getInputSchema,
      async (input) => {
        if (!entityService.getEntityTypes().includes(input.entityType)) {
          return {
            success: false,
            error: `Unknown entity type: ${input.entityType}. Available: ${entityService.getEntityTypes().join(", ")}`,
          };
        }
        const result = await resolveEntityOrError(
          entityService,
          input.entityType,
          input.id,
          logger,
        );
        return result.ok
          ? { success: true, data: { entity: sanitizeEntity(result.entity) } }
          : { success: false, error: result.error };
      },
      {
        visibility: "public",
        cli: {
          name: "get",
        },
      },
    ),

    // ── List ──
    createTool(
      "system",
      "list",
      "List entities by type. Returns metadata only — use system_get for full content.",
      listInputSchema,
      async (input) => {
        if (!entityService.getEntityTypes().includes(input.entityType)) {
          return {
            success: false,
            error: `Unknown entity type: ${input.entityType}. Available: ${entityService.getEntityTypes().join(", ")}`,
          };
        }
        const options: { limit: number; filter?: Record<string, unknown> } = {
          limit: input.limit ?? 20,
        };
        if (input.status)
          options.filter = { metadata: { status: input.status } };
        const entities = await entityService.listEntities(
          input.entityType,
          options,
        );
        const items = entities.map(
          ({ content: _, contentHash: __, ...rest }) => rest,
        );
        return {
          success: true,
          data: { entities: items, count: items.length },
        };
      },
      {
        visibility: "public",
        cli: {
          name: "list",
        },
      },
    ),

    // ── Check job status ──
    createSystemTool(
      "check-job-status",
      "Check the status of background operations",
      checkJobStatusInputSchema,
      async (input) => {
        if (input.batchId) {
          const batch = await jobs.getBatchStatus(input.batchId);
          if (!batch) {
            return {
              success: false,
              error: `No batch found with ID: ${input.batchId}`,
            };
          }
          const pct =
            batch.totalOperations > 0
              ? Math.round(
                  (batch.completedOperations / batch.totalOperations) * 100,
                )
              : 0;
          return {
            success: true,
            data: {
              batchId: input.batchId,
              status: batch.status,
              progress: {
                total: batch.totalOperations,
                completed: batch.completedOperations,
                failed: batch.failedOperations,
                percentComplete: pct,
              },
              currentOperation: batch.currentOperation,
              errors: batch.errors,
            },
          };
        }

        const activeJobs = await jobs.getActiveJobs(input.jobTypes);
        const activeBatches = await jobs.getActiveBatches();
        return {
          success: true,
          data: {
            summary: {
              activeJobs: activeJobs.length,
              activeBatches: activeBatches.length,
            },
            jobs: activeJobs.map((j) => ({
              id: j.id,
              type: j.type,
              status: j.status,
              priority: j.priority,
              retryCount: j.retryCount,
              createdAt: new Date(j.createdAt).toISOString(),
              startedAt: j.startedAt
                ? new Date(j.startedAt).toISOString()
                : null,
            })),
            batches: activeBatches.map((b) => ({
              batchId: b.batchId,
              status: b.status.status,
              totalOperations: b.status.totalOperations,
              completedOperations: b.status.completedOperations,
              failedOperations: b.status.failedOperations,
              currentOperation: b.status.currentOperation,
              pluginId: b.metadata.metadata.pluginId,
              errors: b.status.errors,
            })),
          },
        };
      },
      { visibility: "public" },
    ),

    // ── Get conversation ──
    createTool(
      "system",
      "get-conversation",
      "Get conversation details",
      getConversationInputSchema,
      async (input) => {
        const conv = await conversationService.getConversation(
          input.conversationId,
        );
        if (!conv)
          return {
            success: false,
            error: `Conversation not found: ${input.conversationId}`,
          };
        return {
          success: true,
          data: {
            id: conv.id,
            interfaceType: conv.interfaceType,
            channelId: conv.channelId,
            created: conv.created,
            lastActive: conv.lastActive,
          },
        };
      },
      { visibility: "public" },
    ),

    // ── List conversations ──
    createTool(
      "system",
      "list-conversations",
      "List conversations, optionally filtered by search query",
      listConversationsInputSchema,
      async (input) => {
        const convs = await conversationService.searchConversations(
          input.searchQuery ?? "",
        );
        const limited = convs.slice(0, input.limit ?? 20);
        return {
          success: true,
          data: {
            conversations: limited.map((c) => ({
              id: c.id,
              interfaceType: c.interfaceType,
              channelId: c.channelId,
              created: c.created,
              lastActive: c.lastActive,
            })),
            totalFound: convs.length,
            returned: limited.length,
            searchQuery: input.searchQuery,
          },
        };
      },
      { visibility: "public" },
    ),

    // ── Get messages ──
    createTool(
      "system",
      "get-messages",
      "Get messages from a specific conversation",
      getMessagesInputSchema,
      async (input) => {
        const msgs = await conversationService.getMessages(
          input.conversationId,
          { limit: input.limit ?? 20 },
        );
        return {
          success: true,
          data: {
            conversationId: input.conversationId,
            messages: msgs.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              timestamp: m.timestamp,
            })),
            messageCount: msgs.length,
            requestedLimit: input.limit ?? 20,
          },
        };
      },
      { visibility: "public" },
    ),

    // ── Status ──
    createTool(
      "system",
      "status",
      "Get system status including model, version, interfaces, and tools",
      z.object({}),
      async () => ({ success: true, data: await services.getAppInfo() }),
      {
        visibility: "public",
        cli: {
          name: "status",
        },
      },
    ),

    // ── Create ──
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
        const now = new Date().toISOString();
        try {
          const result = await entityService.createEntity({
            id,
            entityType: createInput.entityType,
            content: createInput.content ?? "",
            metadata: { title: createInput.title ?? id },
            created: now,
            updated: now,
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

    // ── Delete ──
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

        const title =
          typeof entity.metadata["title"] === "string"
            ? entity.metadata["title"]
            : entity.id;
        return {
          needsConfirmation: true,
          toolName: "system_delete",
          description: `Delete "${title}"?\n\nPreview:\n${entity.content.slice(0, 200)}`,
          args: { ...input, id: entity.id, confirmed: true },
        };
      },
      { visibility: "trusted" },
    ),

    // ── Update ──
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
        const normalizedInput = normalizeUpdateInput({
          ...(input.fields !== undefined ? { fields: input.fields } : {}),
          ...(input.content !== undefined ? { content: input.content } : {}),
        });

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

        const title =
          typeof entity.metadata["title"] === "string"
            ? entity.metadata["title"]
            : entity.id;
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
          description: `Update "${title}"?\n\nChanges:\n${diff}`,
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

    // ── Extract ──
    createSystemTool(
      "extract",
      'Extract derived entities from source content. Provide source for single, omit for batch. `mode: "rebuild"` is currently only supported for `entityType: "topic"` and requires confirmation; other entity types fall back to normal derive mode.',
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
            sourceId?: string;
            sourceType?: string;
            mode?: "derive" | "rebuild";
          } = {};
          if (source) {
            for (const type of entityService.getEntityTypes()) {
              const found = await entityService.getEntity(type, source);
              if (found) {
                data.sourceId = found.id;
                data.sourceType = found.entityType;
                break;
              }
            }
            if (!data.sourceId)
              return {
                success: false,
                error: `Source entity not found: ${source}`,
              };
          }

          if (appliedMode === "rebuild") {
            data.mode = "rebuild";
          }

          const jobId = await jobs.enqueue(
            `${entityType}:extract`,
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
                      ? `Rebuild is currently only supported for batch topic extraction. Ran normal derive mode for ${entityType} instead.`
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

    // ── Set cover ──
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

    // ── Insights ──
    createTool(
      "system",
      "insights",
      `Get content insights and analytics. Available types: ${services.insights.getTypes().join(", ")}.`,
      insightsInputSchema,
      async (input) => {
        const data = await services.insights.get(input.type, entityService);
        return { success: true, data };
      },
      { visibility: "public" },
    ),
  ];
}
