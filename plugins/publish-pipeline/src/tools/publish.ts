import type {
  PluginTool,
  ToolContext,
  ServicePluginContext,
  BaseEntity,
} from "@brains/plugins";
import { createTool, parseMarkdownWithFrontmatter } from "@brains/plugins";
import { z } from "@brains/utils";
import type { PublishImageData } from "@brains/utils";
import type { ProviderRegistry } from "../provider-registry";
import type { PublishableMetadata } from "../schemas/publishable";

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
): PluginTool<PublishOutput> {
  // Note: Using type assertion because createTool returns PluginTool but we need PluginTool<PublishOutput>
  // The outputSchema is added separately since createTool doesn't support it yet
  const tool = createTool(
    pluginId,
    "publish",
    "Publish an entity directly to its platform. Works with any registered entity type (social-post, post, deck, etc.)",
    publishInputSchema.shape,
    async (
      input: unknown,
      _toolContext: ToolContext,
    ): Promise<PublishOutput> => {
      try {
        const parsed = publishInputSchema.safeParse(input);

        if (!parsed.success) {
          return {
            success: false,
            error: "entityType is required",
          };
        }

        const { entityType, id, slug } = parsed.data;

        // Validate that at least one identifier is provided
        if (!id && !slug) {
          return {
            success: false,
            error: "Either 'id' or 'slug' must be provided",
          };
        }

        // Find the entity (typed as publishable)
        type PublishableEntity = BaseEntity<PublishableMetadata>;
        let entity: PublishableEntity | null = null;
        if (id) {
          entity = await context.entityService.getEntity<PublishableEntity>(
            entityType,
            id,
          );
        } else if (slug) {
          const entities =
            await context.entityService.listEntities<PublishableEntity>(
              entityType,
              {
                filter: { metadata: { slug } },
                limit: 1,
              },
            );
          entity = entities[0] ?? null;
        }

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

        // Extract body content and frontmatter from markdown
        let bodyContent = entity.content;
        let coverImageId: string | undefined;
        try {
          const parsed = parseMarkdownWithFrontmatter(
            entity.content,
            z.record(z.unknown()),
          );
          bodyContent = parsed.content;
          const rawCoverImageId = parsed.metadata["coverImageId"];
          coverImageId =
            typeof rawCoverImageId === "string" ? rawCoverImageId : undefined;
        } catch {
          // If parsing fails, use content as-is
        }

        // Fetch image data if coverImageId exists
        let imageData: PublishImageData | undefined;
        if (coverImageId) {
          const image = await context.entityService.getEntity<BaseEntity>(
            "image",
            coverImageId,
          );
          if (image?.content) {
            const match = image.content.match(/^data:([^;]+);base64,(.+)$/);
            if (match?.[1] && match[2]) {
              imageData = {
                data: Buffer.from(match[2], "base64"),
                mimeType: match[1],
              };
            }
          }
        }

        // Publish using the provider
        const result = await provider.publish(
          bodyContent,
          entity.metadata,
          imageData,
        );

        // Update entity status
        await context.entityService.updateEntity({
          ...entity,
          metadata: {
            ...entity.metadata,
            status: "published",
            publishedAt: new Date().toISOString(),
            platformId: result.id,
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
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: msg,
        };
      }
    },
  );

  return {
    ...tool,
    outputSchema: publishOutputSchema,
  } as PluginTool<PublishOutput>;
}
