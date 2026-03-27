import type { Tool, ToolResponse } from "@brains/mcp-service";
// TODO (Phase 6b): move createTypedTool to @brains/mcp-service
import { createTypedTool, findEntityByIdentifier } from "@brains/plugins";
import { z, slugify, setCoverImageId } from "@brains/utils";
import type { BaseEntity } from "@brains/entity-service";
import type { SystemServices } from "./types";
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

const confirmedSchema = z
  .object({ confirmed: z.literal(true), contentHash: z.string().optional() })
  .passthrough();
function isConfirmed(rawInput: unknown): boolean {
  return confirmedSchema.safeParse(rawInput).success;
}
function parseConfirmed(
  rawInput: unknown,
): z.infer<typeof confirmedSchema> | undefined {
  const parsed = confirmedSchema.safeParse(rawInput);
  return parsed.success ? parsed.data : undefined;
}

export function createSystemTools(services: SystemServices): Tool[] {
  const { entityService, conversationService, logger, jobs } = services;

  return [
    // ── Search ──
    createTypedTool(
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
      { visibility: "public" },
    ),

    // ── Get ──
    createTypedTool(
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
        const entity = await findEntityByIdentifier(
          entityService,
          input.entityType,
          input.id,
          logger,
        );
        return entity
          ? { success: true, data: { entity: sanitizeEntity(entity) } }
          : {
              success: false,
              error: `Entity not found: ${input.entityType}/${input.id}`,
            };
      },
      { visibility: "public" },
    ),

    // ── List ──
    createTypedTool(
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
      { visibility: "public" },
    ),

    // ── Check job status ──
    {
      name: "system_check-job-status",
      description: "Check the status of background operations",
      inputSchema: checkJobStatusInputSchema.shape,
      visibility: "public" as const,
      handler: async (rawInput: unknown): Promise<ToolResponse> => {
        const input = checkJobStatusInputSchema.parse(rawInput);

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
    },

    // ── Get conversation ──
    createTypedTool(
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
    createTypedTool(
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
    createTypedTool(
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

    // ── Get identity ──
    createTypedTool(
      "system",
      "get-identity",
      "Get the brain's identity — name, role, purpose, values.",
      z.object({}),
      async () => ({ success: true, data: services.getIdentity() }),
      { visibility: "public" },
    ),

    // ── Get profile ──
    createTypedTool(
      "system",
      "get-profile",
      "Get the anchor's profile — name, bio, social links.",
      z.object({}),
      async () => ({ success: true, data: services.getProfile() }),
      { visibility: "public" },
    ),

    // ── Get status ──
    createTypedTool(
      "system",
      "get-status",
      "Get system status including model, version, interfaces, and tools",
      z.object({}),
      async () => ({ success: true, data: await services.getAppInfo() }),
      { visibility: "public" },
    ),

    // ── Create ──
    {
      name: "system_create",
      description:
        "Create a new entity. Provide content for direct creation, or a prompt for AI generation.",
      inputSchema: createInputSchema.shape,
      handler: async (
        rawInput: unknown,
        toolContext,
      ): Promise<ToolResponse> => {
        const parsed = createInputSchema.safeParse(rawInput);
        if (!parsed.success)
          return {
            success: false,
            error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
          };
        const input = parsed.data;
        if (!input.content && !input.prompt)
          return {
            success: false,
            error:
              "Provide 'content' (direct create) or 'prompt' (AI generation), or both.",
          };

        if (input.prompt) {
          try {
            const jobId = await jobs.enqueue(
              `${input.entityType}:generation`,
              {
                prompt: input.prompt,
                title: input.title,
                content: input.content,
                ...input.options,
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

        const id = slugify(input.title ?? `${input.entityType}-${Date.now()}`);
        const now = new Date().toISOString();
        try {
          const result = await entityService.createEntity({
            id,
            entityType: input.entityType,
            content: input.content ?? "",
            metadata: { title: input.title ?? id },
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
      visibility: "trusted",
    },

    // ── Delete ──
    {
      name: "system_delete",
      description: "Delete an entity. Requires confirmation.",
      inputSchema: deleteInputSchema.shape,
      handler: async (rawInput: unknown): Promise<ToolResponse> => {
        const input = deleteInputSchema.parse(rawInput);
        const entity = await findEntityByIdentifier(
          entityService,
          input.entityType,
          input.id,
          logger,
        );
        if (!entity)
          return {
            success: false,
            error: `Entity not found: ${input.entityType}/${input.id}`,
          };

        if (isConfirmed(rawInput)) {
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
      visibility: "trusted",
    },

    // ── Update ──
    {
      name: "system_update",
      description:
        "Update an entity's fields or content. Requires confirmation.",
      inputSchema: updateInputSchema.shape,
      handler: async (rawInput: unknown): Promise<ToolResponse> => {
        const input = updateInputSchema.parse(rawInput);
        const entity = await findEntityByIdentifier(
          entityService,
          input.entityType,
          input.id,
          logger,
        );
        if (!entity)
          return {
            success: false,
            error: `Entity not found: ${input.entityType}/${input.id}`,
          };
        if (input.content && input.fields)
          return {
            success: false,
            error: "Provide either 'content' or 'fields', not both",
          };
        if (!input.content && !input.fields)
          return {
            success: false,
            error:
              "Provide 'content' (full replacement) or 'fields' (partial update)",
          };

        if (isConfirmed(rawInput)) {
          const confirmed = parseConfirmed(rawInput);
          if (
            confirmed?.contentHash &&
            entity.contentHash !== confirmed.contentHash
          ) {
            return {
              success: false,
              error:
                "Entity was modified since you reviewed the changes. Please try again.",
            };
          }
          const updated = input.content
            ? { ...entity, content: input.content }
            : { ...entity, metadata: { ...entity.metadata, ...input.fields } };
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
        if (input.fields) {
          diff = Object.entries(input.fields)
            .map(
              ([key, val]) =>
                `${key}: ${String(entity.metadata[key] ?? "(empty)")} → ${String(val)}`,
            )
            .join("\n");
        } else {
          const oldLines = entity.content.split("\n");
          const newLines = (input.content ?? "").split("\n");
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
            id: entity.id,
            confirmed: true,
            contentHash: entity.contentHash,
          },
        };
      },
      visibility: "trusted",
    },

    // ── Extract ──
    {
      name: "system_extract",
      description:
        "Extract derived entities from source content. Provide source for single, omit for batch.",
      inputSchema: extractInputSchema.shape,
      handler: async (
        rawInput: unknown,
        toolContext,
      ): Promise<ToolResponse> => {
        const parsed = extractInputSchema.safeParse(rawInput);
        if (!parsed.success)
          return {
            success: false,
            error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
          };
        const { entityType, source } = parsed.data;
        if (!entityService.getEntityTypes().includes(entityType)) {
          return {
            success: false,
            error: `Unknown entity type: ${entityType}. Available types: ${entityService.getEntityTypes().join(", ")}`,
          };
        }
        try {
          const data: { sourceId?: string; sourceType?: string } = {};
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
              ...(source && { source }),
            },
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
      visibility: "trusted",
    },

    // ── Set cover ──
    createTypedTool(
      "system",
      "set-cover",
      "Set or remove cover image on an entity.",
      setCoverInputSchema,
      async (input) => {
        try {
          const entity = await findEntityByIdentifier(
            entityService,
            input.entityType,
            input.entityId,
            logger,
          );
          if (!entity)
            return {
              success: false,
              error: `Entity not found: ${input.entityType}/${input.entityId}`,
            };
          const adapter = services.entityRegistry.getAdapter(input.entityType);
          if (!adapter.supportsCoverImage)
            return {
              success: false,
              error: `Entity type '${input.entityType}' doesn't support cover images`,
            };
          if (input.imageId) {
            const image = await entityService.getEntity("image", input.imageId);
            if (!image)
              return {
                success: false,
                error: `Image not found: ${input.imageId}`,
              };
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
