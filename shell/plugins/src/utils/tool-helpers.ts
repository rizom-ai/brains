import type {
  PluginTool,
  PluginResource,
  ToolResponse,
  ToolContext,
} from "../interfaces";
import { getErrorMessage, z, Logger } from "@brains/utils";

/**
 * Zod schema for tool result validation
 * Use this to parse/validate tool results at runtime
 */
export const toolResultSchema = z.union([
  z.object({
    success: z.literal(true),
    data: z.unknown(),
    message: z.string().optional(),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
    code: z.string().optional(),
  }),
]);

/**
 * Standardized tool result type derived from schema
 * All tools should return this format for consistent handling
 *
 * @template T - The type of data returned on success (defaults to unknown)
 */
export type ToolResult<T = unknown> =
  | (Omit<
      Extract<z.infer<typeof toolResultSchema>, { success: true }>,
      "data"
    > & { data: T })
  | Extract<z.infer<typeof toolResultSchema>, { success: false }>;

/**
 * Helper to create a success result
 */
export function toolSuccess<T>(data: T, message?: string): ToolResult<T> {
  return message ? { success: true, data, message } : { success: true, data };
}

/**
 * Helper to create an error result
 */
export function toolError(error: string, code?: string): ToolResult<never> {
  return code ? { success: false, error, code } : { success: false, error };
}

/**
 * Create a typed tool with auto-validation and consistent response format.
 *
 * - Input is automatically validated against the schema
 * - Handler receives typed input (no manual parsing needed)
 * - Must return `ToolResult<T>` for consistent response format
 * - Validation errors are automatically caught and formatted
 *
 * @example
 * ```typescript
 * const captureSchema = z.object({
 *   url: z.string().url(),
 *   title: z.string().optional(),
 * });
 *
 * createTypedTool(
 *   pluginId,
 *   "capture",
 *   "Capture a link",
 *   captureSchema,
 *   async (input, ctx) => {
 *     // input is typed as { url: string; title?: string }
 *     const link = await captureLink(input.url);
 *     return toolSuccess({ linkId: link.id });
 *   }
 * );
 * ```
 */
export function createTypedTool<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TOutput = unknown,
>(
  pluginId: string,
  name: string,
  description: string,
  inputSchema: TSchema,
  handler: (
    input: z.infer<TSchema>,
    context: ToolContext,
  ) => Promise<ToolResult<TOutput>>,
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
    inputSchema: inputSchema.shape,
    handler: async (input, context): Promise<ToolResponse> => {
      logger?.debug(`Tool ${name} started`);
      try {
        // Auto-validate input
        const parseResult = inputSchema.safeParse(input);
        if (!parseResult.success) {
          const errorMessage = parseResult.error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ");
          logger?.debug(`Tool ${name} validation failed: ${errorMessage}`);
          return {
            success: false,
            error: `Invalid input: ${errorMessage}`,
          };
        }

        // Call handler with validated, typed input
        const result = await handler(parseResult.data, context);
        logger?.debug(`Tool ${name} completed`);
        return result;
      } catch (error) {
        logger?.error(`Tool ${name} failed`, error);
        const errorMessage = getErrorMessage(error);
        return {
          success: false,
          error: errorMessage,
        };
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
