import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { type ProgressNotification } from "@brains/utils/progress";
import { z, type ZodRawShape } from "@brains/utils/zod";
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
  conversationId?: string; // Durable conversation/session id for conversation-scoped tools when available
  channelId?: string; // Transport channel/room context (for Matrix, etc.)
  channelName?: string; // Human-readable channel name (for display)
  runId?: string; // Runtime workflow/playbook run context when available
  toolCallId?: string; // AI SDK tool call id when invoked by an agent
  /** Caller's permission level. Tools that read/write entities use this to derive
   *  the content-visibility scope they are allowed to see. */
  userPermissionLevel?: UserPermissionLevel;
}

export interface ToolContextRouting {
  interfaceType: string;
  userId: string;
  conversationId?: string | undefined;
  channelId?: string | undefined;
  channelName?: string | undefined;
  runId?: string | undefined;
  toolCallId?: string | undefined;
  userPermissionLevel?: UserPermissionLevel | undefined;
}

interface ToolContextRoutingSchemaShape extends ZodRawShape {
  interfaceType: z.ZodString;
  userId: z.ZodString;
  conversationId: z.ZodOptional<z.ZodString>;
  channelId: z.ZodOptional<z.ZodString>;
  channelName: z.ZodOptional<z.ZodString>;
  runId: z.ZodOptional<z.ZodString>;
  toolCallId: z.ZodOptional<z.ZodString>;
  userPermissionLevel: z.ZodOptional<
    z.ZodEnum<{
      anchor: "anchor";
      trusted: "trusted";
      public: "public";
    }>
  >;
}

/**
 * Schema for ToolContext routing metadata
 * Used to validate routing information in tool execution requests
 */
export const ToolContextRoutingSchema: z.ZodObject<ToolContextRoutingSchemaShape> =
  z.object({
    interfaceType: z.string(),
    userId: z.string(),
    conversationId: z.string().optional(),
    channelId: z.string().optional(),
    channelName: z.string().optional(),
    runId: z.string().optional(),
    toolCallId: z.string().optional(),
    userPermissionLevel: z.enum(["anchor", "trusted", "public"]).optional(),
  });

export interface ToolSuccessResponse {
  success: true;
  data?: unknown;
  message?: string | undefined;
  cached?: true | undefined;
}

/**
 * Success response schema
 */
export const toolSuccessSchema: z.ZodType<ToolSuccessResponse> = z.strictObject(
  {
    success: z.literal(true),
    data: z.unknown().optional(),
    message: z.string().optional(),
    cached: z.literal(true).optional(),
  },
);

export interface ToolErrorResponse {
  success: false;
  error: string;
  code?: string | undefined;
}

/**
 * Error response schema
 */
export const toolErrorSchema: z.ZodType<ToolErrorResponse> = z.strictObject({
  success: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
});

/**
 * Confirmation response schema
 * Tools return this when an operation needs user approval.
 * The agent service detects this shape and enters the confirmation flow.
 */
export interface ToolConfirmation {
  needsConfirmation: true;
  toolName: string;
  summary: string;
  completionSummary?: string | undefined;
  preview?: string | undefined;
  args: unknown;
}

export const toolConfirmationSchema: z.ZodType<ToolConfirmation> =
  z.strictObject({
    needsConfirmation: z.literal(true),
    toolName: z.string(),
    summary: z.string(),
    completionSummary: z.string().optional(),
    preview: z.string().optional(),
    args: z.unknown(),
  });

/**
 * Standardized tool response schema
 * All tools return one of: success, error, or confirmation request.
 */
export type ToolResponse =
  ToolSuccessResponse | ToolErrorResponse | ToolConfirmation;

export const toolResponseSchema: z.ZodType<ToolResponse> = z.union([
  toolSuccessSchema,
  toolErrorSchema,
  toolConfirmationSchema,
]);

export type ToolSideEffects = "none" | "writes" | "external";
export type ToolInputSchema = ZodRawShape;
export type ToolOutputSchema = z.ZodType;
export type MCPProtocolMode = "basic" | "debug";

/**
 * Tool definition
 * @template TOutput - The output type, defaults to ToolResponse for backward compatibility
 */
export interface Tool<TOutput = ToolResponse> {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  outputSchema?: ToolOutputSchema; // Optional: Zod schema for type-safe outputs
  handler: (input: unknown, context: ToolContext) => Promise<TOutput>;
  visibility?: ToolVisibility; // Default: "anchor" for safety - only explicitly marked tools are public
  /** Declares whether this tool is safe to repeat/cache within one model turn. Undefined defaults to not cacheable. */
  sideEffects?: ToolSideEffects;
  /** MCP protocol annotations advertised to external clients. Derived from sideEffects when omitted. */
  annotations?: ToolAnnotations;
  /** Optional CLI metadata — makes this tool invocable as a brain CLI command */
  cli?: {
    /** CLI command name (e.g. "list", "sync", "build") */
    name: string;
  };
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
  /** Default: "anchor" — prompt bodies can reference restricted workflows,
   *  so they ship as anchor-only unless explicitly marked. */
  visibility?: ToolVisibility;
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
  createMcpServer(permissionLevel?: UserPermissionLevel): McpServer;

  /**
   * Set the permission level for this transport
   */
  setPermissionLevel(level: UserPermissionLevel): void;

  /** Select which registered tools are exposed on the external MCP protocol server. */
  setProtocolMode(mode: MCPProtocolMode): void;
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
   * List tools that have CLI metadata (invocable as brain CLI commands)
   */
  getCliTools(): Array<{ pluginId: string; tool: Tool }>;

  /**
   * List tools filtered by user permission level
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
  registerInstructions(pluginId: string, instructions: string): void;

  /**
   * Get all registered plugin instructions
   */
  getInstructions(): string[];
}

/**
 * Tool registration info
 */
export interface ToolInfo {
  name: string;
  description: string;
  pluginId: string;
}
