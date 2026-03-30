import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * Thin wrapper around the MCP SDK client for remote tool invocation.
 *
 * Connects to a brain's /mcp endpoint via StreamableHTTP, lists tools,
 * and calls them. Used by `brain <command> --remote <url>`.
 */
export class MCPClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport;

  constructor(url: string, token?: string) {
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    this.transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers },
    });

    this.client = new Client({
      name: "brain-cli",
      version: "0.1.0",
    });
  }

  async connect(): Promise<void> {
    // @ts-expect-error SDK type bug: StreamableHTTPClientTransport.sessionId
    // getter returns string|undefined, conflicting with exactOptionalPropertyTypes.
    // Remove when @modelcontextprotocol/sdk fixes the Transport interface.
    await this.client.connect(this.transport);
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  async listTools(): Promise<
    Awaited<ReturnType<Client["listTools"]>>["tools"]
  > {
    const result = await this.client.listTools();
    return result.tools;
  }

  /**
   * Call a tool by name and return the text content.
   * Returns the raw text from the first text content block.
   */
  async callTool(
    name: string,
    input: Record<string, unknown>,
  ): Promise<string> {
    const result = await this.client.callTool({
      name,
      arguments: input,
    });

    const content = result.content;
    if (Array.isArray(content)) {
      const textBlock = content.find((c) => c.type === "text");
      if (textBlock && "text" in textBlock) {
        return textBlock.text;
      }
    }

    return "";
  }
}
