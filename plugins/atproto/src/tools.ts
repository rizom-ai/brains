import type { ServicePluginContext, Tool, ToolResponse } from "@brains/plugins";
import { z } from "@brains/utils";
import type { AtprotoPlugin } from "./plugin";

const publishCardInputSchema = {
  dryRun: z
    .boolean()
    .default(false)
    .describe("Build and return the card record without writing to the PDS"),
};

export function createAtprotoTools(
  pluginId: string,
  plugin: AtprotoPlugin,
  context: ServicePluginContext,
): Tool[] {
  return [createPublishCardTool(pluginId, plugin, context)];
}

function createPublishCardTool(
  pluginId: string,
  plugin: AtprotoPlugin,
  context: ServicePluginContext,
): Tool {
  return {
    name: `${pluginId}_publish_card`,
    description:
      "Publish this brain's AT Protocol capability card to the configured PDS, or dry-run the record payload.",
    inputSchema: publishCardInputSchema,
    handler: async (input): Promise<ToolResponse> => {
      const parsed = z.object(publishCardInputSchema).safeParse(input);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid input: ${parsed.error.message}`,
        };
      }

      try {
        const result = await plugin.publishBrainCard(context, {
          dryRun: parsed.data.dryRun,
        });
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Publish failed",
        };
      }
    },
  };
}
