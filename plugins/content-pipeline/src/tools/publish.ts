import type {
  BaseEntity,
  Tool,
  ToolResponse,
  ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils";
import type { ProviderRegistry } from "../provider-registry";
import {
  PublishExecutor,
  type PublishEntityExecutor,
} from "../publish-executor";

/**
 * Input schema for publish-pipeline:publish tool
 */
export const publishInputSchema = z.object({
  entityType: z
    .string()
    .describe("Entity type to publish (e.g., social-post, post, deck)"),
  id: z.string().optional().describe("Entity ID to publish"),
  slug: z.string().optional().describe("Entity slug to publish"),
  confirmed: z.boolean().optional(),
  confirmationToken: z.string().optional(),
  contentHash: z.string().optional(),
});

export type PublishInput = z.infer<typeof publishInputSchema>;

/**
 * Output schema for publish-pipeline:publish tool - discriminated union for success/error cases
 */
export const publishSuccessSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z
    .object({
      entityType: z.string().optional(),
      entityId: z.string().optional(),
      platformId: z.string().optional(),
      url: z.string().optional(),
    })
    .optional(),
});

export const publishErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
});

export const publishConfirmationSchema = z.object({
  success: z.literal(false).optional(),
  error: z.string().optional(),
  needsConfirmation: z.literal(true),
  toolName: z.string(),
  summary: z.string(),
  preview: z.string().optional(),
  args: z.unknown(),
});

export const publishOutputSchema = z.union([
  publishSuccessSchema,
  publishErrorSchema,
  publishConfirmationSchema,
]);

export type PublishOutput = z.infer<typeof publishOutputSchema>;

/**
 * Create the publish-pipeline:publish tool
 *
 * This is a centralized publish tool that directly publishes any registered
 * entity type using the appropriate provider.
 *
 * @param context - Plugin context for entity access
 * @param pluginId - Plugin ID for tool naming
 * @param providerRegistry - Registry of providers per entity type
 */
export function createPublishTool(
  context: ServicePluginContext,
  pluginId: string,
  providerRegistry: ProviderRegistry,
  publishExecutor?: PublishEntityExecutor,
): Tool<PublishOutput> {
  const executor =
    publishExecutor ??
    new PublishExecutor({
      context,
      providerRegistry,
    });
  const pendingConfirmationTokens = new Set<string>();
  const toolName = `${pluginId}_publish`;

  return {
    name: toolName,
    description:
      "Publish an entity directly to its platform. Call this when the user asks to publish; the tool will request confirmation itself. Works with any registered entity type (social-post, post, deck, etc.)",
    inputSchema: publishInputSchema.shape,
    outputSchema: publishOutputSchema,
    visibility: "anchor",
    handler: async (rawInput, toolContext): Promise<ToolResponse> => {
      const parsed = publishInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid input: ${parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
        };
      }

      const input = parsed.data;
      const { entityType, id, slug } = input;

      try {
        context.permissions.assertEntityActionAllowed(
          entityType,
          "publish",
          toolContext,
        );
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      const validation = await validatePublishCandidate(
        context,
        providerRegistry,
        entityType,
        id,
        slug,
      );
      if ("error" in validation)
        return { success: false, error: validation.error };

      const { entity } = validation;
      if (input.confirmed) {
        const token = input.confirmationToken;
        if (!token || !pendingConfirmationTokens.has(token)) {
          return createPublishConfirmation(
            toolName,
            input,
            entity,
            pendingConfirmationTokens,
          );
        }
        pendingConfirmationTokens.delete(token);

        if (input.contentHash && input.contentHash !== entity.contentHash) {
          return {
            success: false,
            error: `Cannot publish ${entityType}:${entity.id} because it changed after confirmation. Review it and try again.`,
          };
        }

        let publishResult: Awaited<
          ReturnType<PublishEntityExecutor["publish"]>
        >;
        try {
          publishResult = await executor.publish({
            entityType,
            id: entity.id,
          });
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
        if ("error" in publishResult) {
          return {
            success: false,
            error: publishResult.error,
          };
        }

        const { entity: publishedEntity, result } = publishResult;
        return {
          success: true,
          data: {
            entityType,
            entityId: publishedEntity.id,
            platformId: result.id,
            url: result.url,
          },
          message: `Published ${entityType}:${publishedEntity.id}`,
        };
      }

      return createPublishConfirmation(
        toolName,
        input,
        entity,
        pendingConfirmationTokens,
      );
    },
  } as Tool<PublishOutput>;
}

async function validatePublishCandidate(
  context: ServicePluginContext,
  providerRegistry: ProviderRegistry,
  entityType: string,
  id?: string,
  slug?: string,
): Promise<{ entity: BaseEntity } | { error: string }> {
  if (!id && !slug) {
    return { error: "Either 'id' or 'slug' must be provided" };
  }

  const entity = await findEntity(context, entityType, id, slug);
  if (!entity) {
    const identifier = id ?? slug;
    return { error: `Entity not found: ${entityType}:${identifier}` };
  }

  if (entity.visibility !== "public") {
    return {
      error: `Cannot publish ${entityType}:${entity.id} to a public provider because visibility is ${entity.visibility}`,
    };
  }

  if (entity.metadata["status"] === "published") {
    return { error: "Entity is already published" };
  }

  if (!providerRegistry.has(entityType)) {
    return {
      error: `No publish provider registered for ${entityType}. Check that the required credentials are configured.`,
    };
  }

  return { entity };
}

async function findEntity(
  context: ServicePluginContext,
  entityType: string,
  id?: string,
  slug?: string,
): Promise<BaseEntity | null> {
  if (id) {
    return context.entityService.getEntity({ entityType, id });
  }

  if (!slug) return null;

  const entities = await context.entityService.listEntities({
    entityType,
    options: {
      filter: { metadata: { slug } },
      limit: 1,
    },
  });
  return entities[0] ?? null;
}

function createPublishConfirmation(
  toolName: string,
  input: PublishInput,
  entity: BaseEntity,
  pendingConfirmationTokens: Set<string>,
): ToolResponse {
  const confirmationToken = crypto.randomUUID();
  pendingConfirmationTokens.add(confirmationToken);
  const label = getEntityLabel(entity);

  return {
    needsConfirmation: true,
    toolName,
    summary: `Publish "${label}"?`,
    preview: `This will publish ${entity.entityType}:${entity.id} to its registered public publish provider.`,
    args: {
      ...input,
      id: entity.id,
      slug: undefined,
      confirmed: true,
      confirmationToken,
      contentHash: entity.contentHash,
    },
  };
}

function getEntityLabel(entity: BaseEntity): string {
  const title = entity.metadata["title"];
  if (typeof title === "string" && title.length > 0) return title;

  const subject = entity.metadata["subject"];
  if (typeof subject === "string" && subject.length > 0) return subject;

  const slug = entity.metadata["slug"];
  if (typeof slug === "string" && slug.length > 0) return slug;

  return entity.id;
}
