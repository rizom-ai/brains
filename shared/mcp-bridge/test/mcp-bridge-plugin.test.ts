import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";
import { MCPBridgePlugin } from "../src/mcp-bridge-plugin";
import type { ServerCommand } from "../src/mcp-bridge-plugin";
import { z } from "@brains/utils";

// ============================================================================
// Concrete test subclass
// ============================================================================

const testConfigSchema = z.object({
  token: z.string().default("test-token"),
});
type TestConfig = z.infer<typeof testConfigSchema>;

class TestBridgePlugin extends MCPBridgePlugin<TestConfig> {
  /** Expose for test control */
  public allowedTools = ["search", "read_page"];
  public instructions = "Use test_* tools for testing.";
  public serverCmd: ServerCommand = {
    command: "echo",
    args: ["test"],
  };

  constructor(config: Partial<TestConfig> = {}) {
    super(
      "test-bridge",
      { name: "@brains/test-bridge", version: "0.1.0" },
      config,
      testConfigSchema,
    );
  }

  protected getServerCommand(): ServerCommand {
    return this.serverCmd;
  }

  protected getAllowedTools(): string[] {
    return this.allowedTools;
  }

  protected getAgentInstructions(): string {
    return this.instructions;
  }
}

// ============================================================================
// Mock MCP Client
// ============================================================================

/** Simulated remote tools as returned by MCP listTools */
const REMOTE_TOOLS = [
  {
    name: "search",
    description: "Search for pages",
    inputSchema: {
      type: "object" as const,
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
    },
  },
  {
    name: "read_page",
    description: "Read a page by ID",
    inputSchema: {
      type: "object" as const,
      properties: { pageId: { type: "string" } },
      required: ["pageId"],
    },
  },
  {
    name: "create_page",
    description: "Create a new page (should be blocked)",
    inputSchema: {
      type: "object" as const,
      properties: { title: { type: "string" } },
      required: ["title"],
    },
  },
  {
    name: "delete_page",
    description: "Delete a page (should be blocked)",
    inputSchema: {
      type: "object" as const,
      properties: { pageId: { type: "string" } },
      required: ["pageId"],
    },
  },
];

/** Shape returned by MCP client.callTool — text is optional on non-text content */
interface MockToolResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError: boolean;
}

const mockCallTool = mock(
  (): Promise<MockToolResult> =>
    Promise.resolve({
      content: [{ type: "text", text: "mock result" }],
      isError: false,
    }),
);

const mockListTools = mock(() => Promise.resolve({ tools: REMOTE_TOOLS }));

const mockClientClose = mock(() => Promise.resolve());
const mockTransportClose = mock(() => Promise.resolve());

// Mock the MCP SDK modules before any imports use them
void mock.module("@modelcontextprotocol/sdk/client", () => ({
  Client: class MockClient {
    async connect(): Promise<void> {
      // no-op
    }
    async close(): Promise<void> {
      return mockClientClose();
    }
    listTools = mockListTools;
    callTool = mockCallTool;
  },
}));

void mock.module("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: class MockTransport {
    stderr = null;
    onclose?: () => void;
    onerror?: (error: Error) => void;
    async close(): Promise<void> {
      return mockTransportClose();
    }
  },
}));

// ============================================================================
// Tests
// ============================================================================

describe("MCPBridgePlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let plugin: TestBridgePlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    // Reset mocks
    mockCallTool.mockClear();
    mockListTools.mockClear();
    mockClientClose.mockClear();
    mockTransportClose.mockClear();

    // Reset default mock implementations
    mockCallTool.mockImplementation(() =>
      Promise.resolve({
        content: [{ type: "text", text: "mock result" }],
        isError: false,
      }),
    );
    mockListTools.mockImplementation(() =>
      Promise.resolve({ tools: REMOTE_TOOLS }),
    );

    harness = createPluginHarness({ dataDir: "/tmp/test-bridge" });
    plugin = new TestBridgePlugin();
    capabilities = await harness.installPlugin(plugin);
  });

  // --------------------------------------------------------------------------
  // Tool Discovery & Filtering
  // --------------------------------------------------------------------------

  describe("tool discovery", () => {
    it("discovers tools from the remote server", () => {
      expect(mockListTools).toHaveBeenCalledTimes(1);
    });

    it("only exposes tools from the allowlist", () => {
      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("test-bridge_search");
      expect(toolNames).toContain("test-bridge_read_page");
      expect(toolNames).not.toContain("test-bridge_create_page");
      expect(toolNames).not.toContain("test-bridge_delete_page");
    });

    it("exposes exactly the number of allowed tools", () => {
      expect(capabilities.tools).toHaveLength(2);
    });
  });

  // --------------------------------------------------------------------------
  // Tool Adaptation
  // --------------------------------------------------------------------------

  describe("tool adaptation", () => {
    it("prefixes tool names with the plugin id", () => {
      const names = capabilities.tools.map((t) => t.name);
      expect(names.every((n) => n.startsWith("test-bridge_"))).toBe(true);
    });

    it("prefixes descriptions with the plugin id", () => {
      const searchTool = capabilities.tools.find(
        (t) => t.name === "test-bridge_search",
      );
      expect(searchTool?.description).toBe("[test-bridge] Search for pages");
    });

    it("converts JSON Schema properties to Zod shape", () => {
      const searchTool = capabilities.tools.find(
        (t) => t.name === "test-bridge_search",
      );
      expect(searchTool?.inputSchema).toBeDefined();
      expect(searchTool?.inputSchema["query"]).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Tool Execution
  // --------------------------------------------------------------------------

  describe("tool execution", () => {
    it("calls the remote tool and returns success", async () => {
      const result = await harness.executeTool("test-bridge_search", {
        query: "meeting notes",
      });

      expect(result).toEqual({
        success: true,
        data: "mock result",
      });
      expect(mockCallTool).toHaveBeenCalledWith({
        name: "search",
        arguments: { query: "meeting notes" },
      });
    });

    it("returns error when remote tool reports isError", async () => {
      mockCallTool.mockImplementation(() =>
        Promise.resolve({
          content: [{ type: "text", text: "Not found" }],
          isError: true,
        }),
      );

      const result = await harness.executeTool("test-bridge_search", {
        query: "missing",
      });

      expect(result).toEqual({
        success: false,
        error: "test-bridge: Not found",
      });
    });

    it("returns error when remote tool throws", async () => {
      mockCallTool.mockImplementation(() =>
        Promise.reject(new Error("Connection lost")),
      );

      const result = await harness.executeTool("test-bridge_search", {
        query: "test",
      });

      expect(result).toEqual({
        success: false,
        error: "test-bridge: Connection lost",
      });
    });

    it("concatenates multiple text content parts", async () => {
      mockCallTool.mockImplementation(() =>
        Promise.resolve({
          content: [
            { type: "text", text: "line 1" },
            { type: "image", data: "..." },
            { type: "text", text: "line 2" },
          ],
          isError: false,
        }),
      );

      const result = await harness.executeTool("test-bridge_search", {
        query: "test",
      });

      expect(result).toEqual({
        success: true,
        data: "line 1\nline 2",
      });
    });
  });

  // --------------------------------------------------------------------------
  // Instructions
  // --------------------------------------------------------------------------

  describe("instructions", () => {
    it("returns the subclass instructions", () => {
      expect(capabilities.instructions).toBe("Use test_* tools for testing.");
    });
  });

  // --------------------------------------------------------------------------
  // Connection State
  // --------------------------------------------------------------------------

  describe("connection state", () => {
    it("reports connected after successful registration", () => {
      expect(plugin.isConnected()).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Shutdown
  // --------------------------------------------------------------------------

  describe("shutdown", () => {
    it("closes client and transport", async () => {
      await plugin.shutdown?.();

      expect(mockClientClose).toHaveBeenCalledTimes(1);
      expect(mockTransportClose).toHaveBeenCalledTimes(1);
    });

    it("reports disconnected after shutdown", async () => {
      await plugin.shutdown?.();
      expect(plugin.isConnected()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Error Isolation — disconnected server
  // --------------------------------------------------------------------------

  describe("error isolation", () => {
    it("returns error when server is disconnected", async () => {
      // Shut down the connection
      await plugin.shutdown?.();

      const result = await harness.executeTool("test-bridge_search", {
        query: "test",
      });

      expect(result).toEqual({
        success: false,
        error: "test-bridge: MCP server is not connected",
      });
    });
  });
});
