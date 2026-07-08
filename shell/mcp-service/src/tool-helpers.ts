import type { Tool, Resource, ToolResponse, ToolContext } from "./types";
import { getErrorMessage } from "@brains/utils/error";
import { Logger } from "@brains/utils/logger";
import { z, type ZodRawShape } from "@brains/utils/zod";

export interface ToolSuccessResult<T = unknown> {
  success: true;
  data: T;
  message?: string | undefined;
}

export interface ToolErrorResult {
  success: false;
  error: string;
  code?: string | undefined;
}

/**
 * Zod schema for tool result validation
 * Use this to parse/validate tool results at runtime
 */
export const toolResultSchema: z.ZodType<ToolSuccessResult | ToolErrorResult> =
  z.union([
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
export type ToolResult<T = unknown> = ToolSuccessResult<T> | ToolErrorResult;

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
 * Create a tool with auto-validation and consistent response format.
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
 * createTool(
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
function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join(", ");
}

export function createTool<
  TSchema extends z.ZodObject<ZodRawShape>,
  TOutput = unknown,
>(
  pluginId: string,
  name: string,
  description: string,
  inputSchema: TSchema,
  handler: (
    input: z.output<TSchema>,
    context: ToolContext,
  ) => Promise<ToolResult<TOutput>>,
  options: {
    visibility?: Tool["visibility"];
    sideEffects?: Tool["sideEffects"];
    annotations?: Tool["annotations"];
    debug?: boolean;
    cli?: Tool["cli"];
  } = {},
): Tool {
  const {
    visibility = "anchor",
    sideEffects,
    annotations,
    debug = false,
    cli,
  } = options;
  const logger = debug ? Logger.createFresh({ context: pluginId }) : null;
  const inputShape = inputSchema.shape;

  return {
    name: `${pluginId}_${name}`,
    description,
    inputSchema: inputShape,
    handler: async (input, context): Promise<ToolResponse> => {
      logger?.debug(`Tool ${name} started`);
      try {
        // Auto-validate input
        const parseResult = inputSchema.safeParse(input);
        if (!parseResult.success) {
          const errorMessage = formatZodError(parseResult.error);
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
    ...(sideEffects ? { sideEffects } : {}),
    ...(annotations ? { annotations } : {}),
    ...(cli ? { cli } : {}),
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
  handler: Resource["handler"],
  options: {
    mimeType?: string;
    debug?: boolean;
  } = {},
): Resource {
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
