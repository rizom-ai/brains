import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CorePlugin } from "@brains/plugins";
import type { Tool, CorePluginContext, ToolResponse } from "@brains/plugins";
import { z, getErrorMessage } from "@brains/utils";

/**
 * Server command configuration for spawning an MCP server child process.
 */
export interface ServerCommand {
  /** The executable to run (e.g. "npx") */
  command: string;
  /** Arguments to pass to the executable */
  args: string[];
  /** Environment variables for the child process */
  env?: Record<string, string>;
}

/**
 * Schema for a single content part in an MCP tool response.
 */
const mcpContentPartSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
  })
  .passthrough();

/**
 * Schema for the result of calling a remote MCP tool.
 */
const mcpCallToolResultSchema = z
  .object({
    content: z.array(mcpContentPartSchema),
    isError: z.boolean().optional(),
  })
  .passthrough();

/**
 * Schema for a remote tool discovered from the MCP server.
 */
const remoteToolSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    inputSchema: z
      .object({
        type: z.literal("object"),
        properties: z.record(z.object({}).passthrough()).optional(),
        required: z.array(z.string()).optional(),
      })
      .passthrough(),
  })
  .passthrough();

type RemoteTool = z.infer<typeof remoteToolSchema>;

/**
 * MCPBridgePlugin — reusable base class for plugins that wrap an external MCP server.
 *
 * Subclasses define three things:
 * 1. What to spawn (`getServerCommand`)
 * 2. Which tools to expose (`getAllowedTools`)
 * 3. What to tell the agent (`getAgentInstructions`)
 *
 * The base class handles: spawn, MCP handshake, tool discovery, filtering,
 * adaptation (prefix + error isolation), and shutdown.
 *
 * If the child process crashes, tools return errors — the brain doesn't crash.
 */
export abstract class MCPBridgePlugin<
  TConfig = unknown,
> extends CorePlugin<TConfig> {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private remoteTools: RemoteTool[] = [];
  private cachedTools: Tool[] | null = null;
  private connected = false;

  protected abstract getServerCommand(): ServerCommand;
  protected abstract getAllowedTools(): string[];
  protected abstract getAgentInstructions(): string;

  protected override async onRegister(
    context: CorePluginContext,
  ): Promise<void> {
    await this.connect(context);
  }

  /**
   * Spawn the MCP server, connect via stdio, discover and filter tools.
   */
  private async connect(context: CorePluginContext): Promise<void> {
    const serverCommand = this.getServerCommand();

    context.logger.info(
      `Spawning MCP server: ${serverCommand.command} ${serverCommand.args.join(" ")}`,
    );

    this.transport = new StdioClientTransport({
      command: serverCommand.command,
      args: serverCommand.args,
      ...(serverCommand.env && { env: serverCommand.env }),
      stderr: "pipe",
    });

    this.client = new Client({
      name: `brains-${this.id}`,
      version: this.version,
    });

    // Log stderr from the child process
    const stderr = this.transport.stderr;
    if (
      stderr &&
      "on" in stderr &&
      typeof (stderr as { on?: unknown }).on === "function"
    ) {
      const readable = stderr as {
        on(event: string, cb: (chunk: Buffer) => void): void;
      };
      readable.on("data", (chunk: Buffer) => {
        context.logger.debug(`[${this.id} server] ${chunk.toString().trim()}`);
      });
    }

    // Monitor transport close
    this.transport.onclose = (): void => {
      if (this.connected) {
        context.logger.warn(
          `MCP server for ${this.id} disconnected unexpectedly`,
        );
        this.connected = false;
      }
    };

    this.transport.onerror = (error: Error): void => {
      context.logger.error(`MCP transport error for ${this.id}`, { error });
    };

    try {
      await this.client.connect(this.transport);
      this.connected = true;
      context.logger.info(`Connected to MCP server for ${this.id}`);

      // Discover and filter tools
      await this.discoverTools(context);
    } catch (error) {
      context.logger.error(`Failed to connect to MCP server for ${this.id}`, {
        error,
      });
      // Don't throw — the plugin registers but tools will return errors
      this.connected = false;
    }
  }

  /**
   * Discover tools from the remote server and filter by allowlist.
   */
  private async discoverTools(context: CorePluginContext): Promise<void> {
    if (!this.client || !this.connected) return;

    try {
      const result = await this.client.listTools();
      const allowed = new Set(this.getAllowedTools());
      const allTools = z.array(remoteToolSchema).parse(result.tools);

      this.remoteTools = allTools.filter((t) => allowed.has(t.name));

      const discovered = allTools.map((t) => t.name);
      const exposed = this.remoteTools.map((t) => t.name);
      const blocked = discovered.filter((n) => !allowed.has(n));

      context.logger.info(
        `Discovered ${discovered.length} tools, exposing ${exposed.length}: [${exposed.join(", ")}]`,
      );
      if (blocked.length > 0) {
        context.logger.debug(
          `Blocked ${blocked.length} tools: [${blocked.join(", ")}]`,
        );
      }
    } catch (error) {
      context.logger.error(
        `Failed to discover tools from MCP server for ${this.id}`,
        { error },
      );
      this.remoteTools = [];
      this.cachedTools = null;
    }
  }

  /**
   * Adapt remote MCP tools: prefix names, isolate errors, convert JSON Schema → Zod.
   */
  protected override async getTools(): Promise<Tool[]> {
    this.cachedTools ??= this.remoteTools.map((remote) =>
      this.adaptTool(remote),
    );
    return this.cachedTools;
  }

  /**
   * Adapt a single remote tool into a Tool.
   */
  private adaptTool(remote: RemoteTool): Tool {
    const pluginId = this.id;

    const zodShape = this.jsonSchemaToZodShape(
      remote.inputSchema.properties ?? {},
      remote.inputSchema.required ?? [],
    );

    return {
      name: `${pluginId}_${remote.name}`,
      description: remote.description
        ? `[${pluginId}] ${remote.description}`
        : `[${pluginId}] ${remote.name}`,
      inputSchema: zodShape,
      handler: async (input: unknown): Promise<ToolResponse> => {
        return this.callRemoteTool(remote.name, input);
      },
    };
  }

  /**
   * Call a tool on the remote MCP server with error isolation.
   */
  private async callRemoteTool(
    toolName: string,
    input: unknown,
  ): Promise<ToolResponse> {
    if (!this.client || !this.connected) {
      return {
        success: false,
        error: `${this.id}: MCP server is not connected`,
      };
    }

    try {
      const result = await this.client.callTool({
        name: toolName,
        arguments: (input ?? {}) as Record<string, unknown>,
      });

      // Validate and extract text content from the MCP response
      const parsed = mcpCallToolResultSchema.parse(result);
      const text = parsed.content
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text)
        .join("\n");

      if (parsed.isError) {
        return {
          success: false,
          error: `${this.id}: ${text || "Unknown error from MCP server"}`,
        };
      }

      return {
        success: true,
        data: text,
      };
    } catch (error) {
      return {
        success: false,
        error: `${this.id}: ${getErrorMessage(error)}`,
      };
    }
  }

  protected override async getInstructions(): Promise<string> {
    return this.getAgentInstructions();
  }

  protected override async onShutdown(): Promise<void> {
    this.connected = false;

    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // Ignore close errors — process may already be dead
      }
      this.client = null;
    }

    if (this.transport) {
      try {
        await this.transport.close();
      } catch {
        // Ignore close errors
      }
      this.transport = null;
    }

    this.remoteTools = [];
    this.cachedTools = null;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Convert JSON Schema properties to a Zod shape.
   *
   * MCP tools declare inputSchema as JSON Schema, but Tool expects
   * a ZodRawShape. This does a best-effort conversion for common types.
   */
  private jsonSchemaToZodShape(
    properties: Record<string, object>,
    required: string[],
  ): z.ZodRawShape {
    const requiredSet = new Set(required);
    const shape: z.ZodRawShape = {};

    for (const [key, schema] of Object.entries(properties)) {
      let zodType = this.jsonSchemaPropertyToZod(schema);

      if (!requiredSet.has(key)) {
        zodType = zodType.optional();
      }

      shape[key] = zodType;
    }

    return shape;
  }

  /**
   * Convert a single JSON Schema property to a Zod type.
   */
  private jsonSchemaPropertyToZod(schema: object): z.ZodTypeAny {
    const s = schema as Record<string, unknown>;
    const type = s["type"] as string | undefined;
    const description = s["description"] as string | undefined;

    let zodType: z.ZodTypeAny;

    switch (type) {
      case "string":
        zodType = z.string();
        break;
      case "number":
      case "integer":
        zodType = z.number();
        break;
      case "boolean":
        zodType = z.boolean();
        break;
      case "array":
        zodType = z.array(z.unknown());
        break;
      case "object":
        zodType = z.record(z.unknown());
        break;
      default:
        // Unknown or missing type — accept anything
        zodType = z.unknown();
        break;
    }

    if (description && "describe" in zodType) {
      zodType = (zodType as z.ZodString).describe(description);
    }

    return zodType;
  }
}
