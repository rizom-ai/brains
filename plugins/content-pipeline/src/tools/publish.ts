import type { Tool, ToolResult, ServicePluginContext } from "@brains/plugins";
import { createTool } from "@brains/plugins";
import { z } from "@brains/utils";
import type { ProviderRegistry } from "../provider-registry";
import { PublishExecutor } from "../publish-executor";

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
  const executor = new PublishExecutor({ context, providerRegistry });
  const tool = createTool(
    pluginId,
    "publish",
    "Publish an entity directly to its platform. Works with any registered entity type (social-post, post, deck, etc.)",
    publishInputSchema,
    async (input, toolContext): Promise<ToolResult> => {
      const { entityType, id, slug } = input;

      context.permissions.assertEntityActionAllowed(
        entityType,
        "publish",
        toolContext,
      );

      const publishResult = await executor.publish({ entityType, id, slug });
      if ("error" in publishResult) {
        return {
          success: false,
          error: publishResult.error,
        };
      }

      const { entity, result } = publishResult;
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
