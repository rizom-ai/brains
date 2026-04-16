import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MCPInterface } from "../src/mcp-interface";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import { StreamableHTTPServer } from "../src/transports/http-server";

describe("MCPInterface", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  function installMockHttpTransport(): void {
    const mcpServer = new McpServer({ name: "test-server", version: "1.0.0" });
    const mockTransport = {
      getMcpServer: (): McpServer => mcpServer,
      createMcpServer: (): McpServer =>
        new McpServer({ name: "test-server", version: "1.0.0" }),
      setPermissionLevel: (): void => {},
    };

    harness.getMockShell().getMCPService = (): never => mockTransport as never;
  }

  function installWebserverPlugin(): void {
    harness.getMockShell().addPlugin({
      id: "webserver",
      version: "1.0.0",
      type: "interface",
      packageName: "@brains/webserver",
      register: async () => ({ tools: [], resources: [] }),
    });
  }

  beforeEach(() => {
    harness = createPluginHarness({
      logger: createSilentLogger("mcp-test"),
    });
  });

  afterEach(async () => {
    await harness.getMockShell().getDaemonRegistry().stopPlugin("mcp");
    StreamableHTTPServer.resetInstance();
  });

  describe("initialization", () => {
    it("should create instance with default config", () => {
      const plugin = new MCPInterface();
      expect(plugin.id).toBe("mcp");
      expect(plugin.packageName).toBe("@brains/mcp");
    });

    it("should create instance with stdio transport", () => {
      const plugin = new MCPInterface({ transport: "stdio" });
      expect(plugin.id).toBe("mcp");
    });

    it("should create instance with http transport", () => {
      const plugin = new MCPInterface({
        transport: "http",
        httpPort: 3001,
      });
      expect(plugin.id).toBe("mcp");
    });
  });

  describe("shared web routes", () => {
    it("should expose shared-host routes for HTTP transport", () => {
      const plugin = new MCPInterface({ transport: "http", httpPort: 3001 });

      const routes = plugin.getWebRoutes();
      expect(routes).toHaveLength(5);
      expect(routes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "/status", method: "GET" }),
          expect.objectContaining({ path: "/mcp", method: "GET" }),
          expect.objectContaining({ path: "/mcp", method: "POST" }),
          expect.objectContaining({ path: "/mcp", method: "DELETE" }),
          expect.objectContaining({ path: "/mcp", method: "OPTIONS" }),
        ]),
      );
    });

    it("should expose no shared-host routes for stdio transport", () => {
      const plugin = new MCPInterface({ transport: "stdio" });
      expect(plugin.getWebRoutes()).toEqual([]);
    });

    it("should proxy shared-host status route to the MCP HTTP transport", async () => {
      installMockHttpTransport();
      installWebserverPlugin();

      const plugin = new MCPInterface({
        transport: "http",
        httpPort: 3001,
        authToken: "test-token",
      });
      await harness.installPlugin(plugin);
      await harness.getMockShell().getDaemonRegistry().startPlugin("mcp");

      const route = plugin
        .getWebRoutes()
        .find((candidate) => candidate.path === "/status");

      expect(route).toBeDefined();
      if (!route) {
        throw new Error("Expected MCP status route");
      }

      const response = await route.handler(new Request("http://brain/status"));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.port).toBe(3001);
      expect(body.sessions).toBe(0);
    });
  });

  describe("registration", () => {
    it("should register with stdio transport and anchor permissions", async () => {
      const plugin = new MCPInterface({ transport: "stdio" });

      const capabilities = await harness.installPlugin(plugin);

      expect(plugin.id).toBe("mcp");
      expect(capabilities).toBeDefined();
      expect(capabilities.tools).toHaveLength(0);
      // Resources are provided by system plugin, not MCP interface
      expect(capabilities.resources).toHaveLength(0);
    });

    it("should register with http transport and anchor permissions", async () => {
      installWebserverPlugin();
      const plugin = new MCPInterface({ transport: "http" });

      const capabilities = await harness.installPlugin(plugin);

      expect(plugin.id).toBe("mcp");
      expect(capabilities).toBeDefined();
      expect(capabilities.tools).toHaveLength(0);
      expect(capabilities.resources).toHaveLength(0);
    });
  });

  describe("lifecycle", () => {
    it("should register with stdio transport", async () => {
      const plugin = new MCPInterface({ transport: "stdio" });

      const capabilities = await harness.installPlugin(plugin);

      // Plugin should register successfully
      expect(capabilities).toBeDefined();
    });

    it("should register with http transport", async () => {
      installWebserverPlugin();
      const plugin = new MCPInterface({ transport: "http" });

      const capabilities = await harness.installPlugin(plugin);

      // Plugin should register successfully
      expect(capabilities).toBeDefined();
    });
  });

  describe("daemon management", () => {
    it("should create daemon for lifecycle management", async () => {
      const plugin = new MCPInterface({ transport: "stdio" });

      await harness.installPlugin(plugin);

      // Verify the plugin has daemon support through its type
      expect(plugin.type).toBe("interface");
    });

    it("should create http daemon with correct port", async () => {
      installWebserverPlugin();
      const plugin = new MCPInterface({
        transport: "http",
        httpPort: 3333,
        authToken: "test-token",
      });

      const capabilities = await harness.installPlugin(plugin);

      // Plugin should have registered with daemon support
      expect(capabilities).toBeDefined();
    });

    it("should require webserver for http transport", async () => {
      const plugin = new MCPInterface({
        transport: "http",
        httpPort: 0,
        authToken: "test-token",
      });

      return expect(harness.installPlugin(plugin)).rejects.toThrow(
        "MCP HTTP transport requires the webserver interface",
      );
    });
  });
});
