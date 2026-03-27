import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  z,
  type ZodRawShape,
  type ZodType,
  type ProgressNotification,
} from "@brains/utils";
import type { UserPermissionLevel } from "@brains/templates";

/**
 * Tool visibility levels for permission control
 * Uses the same levels as UserPermissionLevel for consistency
 */
export type ToolVisibility = UserPermissionLevel;

/**
 * Tool execution context
 * Provides progress reporting and routing metadata
 */
export interface ToolContext {
  // Progress reporting
  progressToken?: string | number;
  sendProgress?: (notification: ProgressNotification) => Promise<void>;

  // Routing metadata for job creation (required for proper context propagation)
  interfaceType: string; // Which interface called the tool (e.g., "mcp", "cli", "matrix")
  userId: string; // User who invoked the tool
  channelId?: string; // Channel/room context (for Matrix, etc.)
  channelName?: string; // Human-readable channel name (for display)
}

/**
 * Schema for ToolContext routing metadata
 * Used to validate routing information in tool execution requests
 */
export const ToolContextRoutingSchema = z.object({
  interfaceType: z.string(),
  userId: z.string(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
});

/**
 * Success response schema
 */
export const toolSuccessSchema = z.object({
  success: z.literal(true),
  data: z.unknown(),
  message: z.string().optional(),
});

/**
 * Error response schema
 */
export const toolErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
});

/**
 * Confirmation response schema
 * Tools return this when a destructive operation needs user approval.
 * The agent service detects this shape and enters the confirmation flow.
 */
export const toolConfirmationSchema = z.object({
  needsConfirmation: z.literal(true),
  toolName: z.string(),
  description: z.string(),
  args: z.unknown(),
});

export type ToolConfirmation = z.infer<typeof toolConfirmationSchema>;

/**
 * Standardized tool response schema
 * All tools return one of: success, error, or confirmation request.
 */
export const toolResponseSchema = z.union([
  toolSuccessSchema,
  toolErrorSchema,
  toolConfirmationSchema,
]);

export type ToolResponse = z.infer<typeof toolResponseSchema>;

/**
 * Tool definition
 * @template TOutput - The output type, defaults to ToolResponse for backward compatibility
 */
export interface Tool<TOutput = ToolResponse> {
  name: string;
  description: string;
  inputSchema: ZodRawShape; // Same type as MCP expects
  outputSchema?: ZodType<TOutput>; // Optional: Zod schema for type-safe outputs
  handler: (input: unknown, context: ToolContext) => Promise<TOutput>;
  visibility?: ToolVisibility; // Default: "anchor" for safety - only explicitly marked tools are public
}

/**
 * Resource definition
 */
export interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  handler: () => Promise<{
    contents: Array<{
      text: string;
      uri: string;
      mimeType?: string;
    }>;
  }>;
}

/**
 * Variables extracted from a URI template.
 * Generic parameter ensures handlers receive typed vars, not loose index signatures.
 */
export type ResourceVars<K extends string = string> = { [P in K]: string };

/**
 * A parameterized resource with URI template (e.g. "entity://{type}/{id}")
 */
export interface ResourceTemplate<K extends string = string> {
  name: string;
  uriTemplate: string;
  description?: string;
  mimeType?: string;
  /** List all concrete resources matching this template (for resources/list) */
  list?: () => Promise<Array<{ uri: string; name: string }>>;
  /** Autocomplete values for template variables (populates client selectors) */
  complete?: Record<
    K,
    (
      value: string,
      context?: { arguments?: Partial<ResourceVars<K>> },
    ) => string[] | Promise<string[]>
  >;
  /** Read a single resource by resolved template variables */
  handler: (vars: ResourceVars<K>) => Promise<{
    contents: Array<{ text: string; uri: string; mimeType?: string }>;
  }>;
}

/**
 * An MCP prompt — parameterized message template for client prompt pickers
 */
export interface Prompt {
  name: string;
  description?: string;
  args: Record<string, { description: string; required?: boolean }>;
  handler: (args: Record<string, string>) => Promise<{
    messages: Array<{
      role: "user" | "assistant";
      content: { type: "text"; text: string };
    }>;
  }>;
}

/**
 * Minimal interface exposed to transport layers
 * Only provides what's needed to connect transports to the MCP server
 */
export interface IMCPTransport {
  /**
   * Get the underlying MCP server for transport layers to connect to
   * Transport layers should import McpServer type from @modelcontextprotocol/sdk directly
   */
  getMcpServer(): McpServer;

  /**
   * Create a fresh MCP server instance with all registered tools/resources.
   * Required for Streamable HTTP where each session needs its own server.
   */
  createMcpServer(): McpServer;

  /**
   * Set the permission level for this transport
   */
  setPermissionLevel(level: UserPermissionLevel): void;
}

/**
 * Full MCP Service interface for managing tool and resource registration
 * Extends the transport interface with registration capabilities
 */
export interface IMCPService extends IMCPTransport {
  /**
   * Register a tool with the MCP server
   */
  registerTool(pluginId: string, tool: Tool): void;

  /**
   * Register a resource with the MCP server
   */
  registerResource(pluginId: string, resource: Resource): void;

  /**
   * Register a resource template with parameterized URI
   */
  registerResourceTemplate<K extends string = string>(
    pluginId: string,
    template: ResourceTemplate<K>,
  ): void;

  /**
   * Register an MCP prompt
   */
  registerPrompt(pluginId: string, prompt: Prompt): void;

  /**
   * List all registered tools
   */
  listTools(): Array<{ pluginId: string; tool: Tool }>;

  /**
   * List tools filtered by user permission level
   * Used for per-message filtering in multi-user contexts (e.g., Matrix rooms)
   */
  listToolsForPermissionLevel(
    userLevel: UserPermissionLevel,
  ): Array<{ pluginId: string; tool: Tool }>;

  /**
   * List all registered resources
   */
  listResources(): Array<{ pluginId: string; resource: Resource }>;

  /**
   * Register behavioral instructions from a plugin for the agent system prompt
   */
  registerPluginInstructions(pluginId: string, instructions: string): void;

  /**
   * Get all registered plugin instructions
   */
  getPluginInstructions(): string[];
}

/**
 * Tool registration info
 */
export interface ToolInfo {
  name: string;
  description: string;
  pluginId: string;
}
