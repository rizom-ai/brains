import type {
  Tool,
  ToolResult,
  ServicePluginContext,
  BaseEntity,
} from "@brains/plugins";
import { createTool } from "@brains/plugins";
import { z } from "@brains/utils";
import type { ProviderRegistry } from "../provider-registry";
import type { PublishableMetadata } from "../schemas/publishable";
import { preparePublishContent } from "./publish-content";

type PublishableEntity = BaseEntity<PublishableMetadata>;

/**
 * Input schema for publish-pipeline:publish tool
 */
export const publishInputSchema = z.object({
  entityType: z
    .string()
    .describe("Entity type to publish (e.g., social-post, post, deck)"),
  id: z.string().optional().describe("Entity ID to publish"),
  slug: z.string().optional().describe("Entity slug to publish"),
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

export const publishOutputSchema = z.union([
  publishSuccessSchema,
  publishErrorSchema,
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
): Tool<PublishOutput> {
  const tool = createTool(
    pluginId,
    "publish",
    "Publish an entity directly to its platform. Works with any registered entity type (social-post, post, deck, etc.)",
    publishInputSchema,
    async (input): Promise<ToolResult> => {
      const { entityType, id, slug } = input;

      // Validate that at least one identifier is provided
      if (!id && !slug) {
        return {
          success: false,
          error: "Either 'id' or 'slug' must be provided",
        };
      }

      const entity = await findPublishableEntity(context, entityType, id, slug);

      if (!entity) {
        const identifier = id ?? slug;
        return {
          success: false,
          error: `Entity not found: ${entityType}:${identifier}`,
        };
      }

      // Check if already published
      if (entity.metadata.status === "published") {
        return {
          success: false,
          error: "Entity is already published",
        };
      }

      // Get the provider for this entity type
      if (!providerRegistry.has(entityType)) {
        return {
          success: false,
          error: `No publish provider registered for ${entityType}. Check that the required credentials are configured.`,
        };
      }
      const provider = providerRegistry.get(entityType);

      const { bodyContent, imageData } = await preparePublishContent(
        context,
        entity,
      );

      // Publish using the provider
      const result = await provider.publish(
        bodyContent,
        entity.metadata,
        imageData,
      );

      // Update entity status
      await context.entityService.updateEntity({
        entity: {
          ...entity,
          metadata: {
            ...entity.metadata,
            status: "published",
            publishedAt: new Date().toISOString(),
            platformId: result.id,
          },
        },
      });

      return {
        success: true,
        data: {
          entityType,
          entityId: entity.id,
          platformId: result.id,
          url: result.url,
        },
        message: `Published ${entityType}:${entity.id}`,
      };
    },
  );

  return {
    ...tool,
    outputSchema: publishOutputSchema,
  } as Tool<PublishOutput>;
}

async function findPublishableEntity(
  context: ServicePluginContext,
  entityType: string,
  id?: string,
  slug?: string,
): Promise<PublishableEntity | null> {
  if (id) {
    return context.entityService.getEntity<PublishableEntity>({
      entityType,
      id,
    });
  }

  if (!slug) return null;

  const entities = await context.entityService.listEntities<PublishableEntity>({
    entityType,
    options: {
      filter: { metadata: { slug } },
      limit: 1,
    },
  });
  return entities[0] ?? null;
}
