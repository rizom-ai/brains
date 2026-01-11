import type { PluginTool, PluginResource, ToolResponse } from "../interfaces";
import type { z } from "@brains/utils";
import { Logger } from "@brains/utils";

/**
 * Create a tool with consistent structure and optional debug logging.
 *
 * Use this in tool factory functions instead of building tool objects manually.
 *
 * @example
 * ```typescript
 * export function createLinkTools(pluginId: string, context: ServicePluginContext): PluginTool[] {
 *   return [
 *     createTool(pluginId, "capture", "Capture a link", captureSchema.shape, async (input, ctx) => {
 *       // handler implementation
 *     }),
 *   ];
 * }
 * ```
 */
export function createTool(
  pluginId: string,
  name: string,
  description: string,
  inputSchema: z.ZodRawShape,
  handler: PluginTool["handler"],
  options: {
    visibility?: PluginTool["visibility"];
    debug?: boolean;
  } = {},
): PluginTool {
  const { visibility = "anchor", debug = false } = options;
  const logger = debug ? Logger.createFresh({ context: pluginId }) : null;

  return {
    name: `${pluginId}_${name}`,
    description,
    inputSchema,
    handler: async (input, context): Promise<ToolResponse> => {
      logger?.debug(`Tool ${name} started`);
      try {
        const result = await handler(input, context);
        logger?.debug(`Tool ${name} completed`);
        return result;
      } catch (error) {
        logger?.error(`Tool ${name} failed`, error);
        throw error;
      }
    },
    visibility,
  };
}

/**
 * Create a resource with consistent structure and optional debug logging.
 *
 * Use this in resource factory functions instead of building resource objects manually.
 */
export function createResource(
  pluginId: string,
  uri: string,
  name: string,
  description: string,
  handler: PluginResource["handler"],
  options: {
    mimeType?: string;
    debug?: boolean;
  } = {},
): PluginResource {
  const { mimeType = "text/plain", debug = false } = options;
  const logger = debug ? Logger.createFresh({ context: pluginId }) : null;

  return {
    uri: `${pluginId}_${uri}`,
    name,
    description,
    mimeType,
    handler: async (): Promise<{
      contents: Array<{
        text: string;
        uri: string;
        mimeType?: string;
      }>;
    }> => {
      logger?.debug(`Resource ${uri} started`);
      try {
        const result = await handler();
        logger?.debug(`Resource ${uri} completed`);
        return result;
      } catch (error) {
        logger?.error(`Resource ${uri} failed`, error);
        throw error;
      }
    },
  };
}
