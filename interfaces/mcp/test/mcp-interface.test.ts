import { createMockMCPService } from "@brains/mcp-service/test";
import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpPlugin } from "./mcp-plugin";
import type { Plugin, WebRouteDefinition } from "@brains/plugins";
import { FatalPluginConfigurationError } from "@brains/plugins";
import {
  createMockAuthBackend,
  createPluginHarness,
} from "@brains/plugins/test";
import type { IMCPService } from "@brains/mcp-service";
import { createSilentLogger } from "@brains/test-utils";

const webserverPlugin: Plugin = {
  id: "webserver",
  version: "1.0.0",
  type: "interface",
  packageName: "@brains/webserver",
  register: async () => ({ tools: [], resources: [] }),
};

function routesOf(plugin: Plugin): WebRouteDefinition[] {
  return "getWebRoutes" in plugin && typeof plugin.getWebRoutes === "function"
    ? plugin.getWebRoutes()
    : [];
}

describe("MCPInterface", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  function installMockHttpTransport(): {
    permissionLevels: string[];
    protocolModes: string[];
  } {
    const mcpServer = new McpServer({ name: "test-server", version: "1.0.0" });
    const permissionLevels: string[] = [];
    const protocolModes: string[] = [];
    const calls = {
      permissionLevels,
      protocolModes,
    };
    const mockTransport: IMCPService = {
      ...createMockMCPService(),
      getMcpServer: (): McpServer => mcpServer,
      createMcpServer: (): McpServer =>
        new McpServer({ name: "test-server", version: "1.0.0" }),
      setPermissionLevel: (level): void => {
        calls.permissionLevels.push(level);
      },
      setProtocolMode: (mode): void => {
        calls.protocolModes.push(mode);
      },
    };

    harness.getMockShell().getMCPService = (): IMCPService => mockTransport;
    return calls;
  }

  function installWebserverPlugin(): void {
    harness.getMockShell().addPlugin(webserverPlugin);
  }

  beforeEach(() => {
    harness = createPluginHarness({
      logger: createSilentLogger("mcp-test"),
    });
  });

  afterEach(async () => {
    await harness.getMockShell().getDaemonRegistry().stopPlugin("mcp");
  });

  describe("initialization", () => {
    it("should create instance with default config", () => {
      const plugin = createMcpPlugin();
      expect(plugin.id).toBe("mcp");
      expect(plugin.packageName).toBe("@brains/mcp");
    });

    it("should create instance with stdio transport", () => {
      const plugin = createMcpPlugin({ transport: "stdio" });
      expect(plugin.id).toBe("mcp");
    });

    it("should create instance with http transport", () => {
      const plugin = createMcpPlugin({
        transport: "http",
        httpPort: 3001,
      });
      expect(plugin.id).toBe("mcp");
    });
  });

  describe("protocol-only registration", () => {
    it.each(["http", "stdio"] as const)(
      "registers the same protocol without hosting %s",
      async (transport) => {
        const calls = installMockHttpTransport();
        const hosted = createMcpPlugin({ transport });
        const protocol = hosted.createProtocolPlugin();
        const capabilities = await harness.installPlugin(protocol);

        expect(capabilities.tools.map((tool) => tool.name)).toEqual([
          "chat",
          "confirm",
        ]);
        expect(protocol.id).toBe("mcp");
        expect(routesOf(protocol)).toEqual([]);
        expect(harness.getMockShell().getDaemonRegistry().getAll()).toEqual([]);
        expect(harness.getMockShell().listEndpoints()).toEqual([]);
        expect(harness.getMockShell().listInteractions()).toEqual([]);
        expect(calls.protocolModes).toEqual(["basic"]);
        expect(calls.permissionLevels).toEqual([]);
        // Protocol-only registration does not change the original host config.
        const hostHarness = createPluginHarness({
          logger: createSilentLogger("mcp-test"),
        });
        hostHarness.getMockShell().addPlugin(webserverPlugin);
        await hostHarness.installPlugin(hosted);
        expect(routesOf(hosted)).toHaveLength(transport === "http" ? 5 : 0);
      },
    );

    it("preserves protocol mode without carrying HTTP authentication or routes", async () => {
      const calls = installMockHttpTransport();
      const protocol = createMcpPlugin({
        transport: "http",
        mode: "debug",
        authToken: "host-only-secret",
      }).createProtocolPlugin();
      await harness.installPlugin(protocol);
      expect(calls.protocolModes).toEqual(["debug"]);
      expect(routesOf(protocol)).toEqual([]);
      expect(harness.getMockShell().getDaemonRegistry().getAll()).toEqual([]);
    });
  });

  describe("shared web routes", () => {
    it("should expose shared-host routes for HTTP transport", async () => {
      installWebserverPlugin();
      const plugin = createMcpPlugin({ transport: "http", httpPort: 3001 });
      await harness.installPlugin(plugin);

      const routes = routesOf(plugin);
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

    it("should expose no shared-host routes for stdio transport", async () => {
      const plugin = createMcpPlugin({ transport: "stdio" });
      await harness.installPlugin(plugin);
      expect(routesOf(plugin)).toEqual([]);
    });

    it("should proxy shared-host status route to the MCP HTTP transport", async () => {
      installMockHttpTransport();
      installWebserverPlugin();

      const plugin = createMcpPlugin({
        transport: "http",
        httpPort: 3001,
        authToken: "test-token",
      });
      await harness.installPlugin(plugin);
      await harness.getMockShell().getDaemonRegistry().startPlugin("mcp");

      const route = routesOf(plugin).find(
        (candidate) => candidate.path === "/status",
      );

      expect(route).toBeDefined();
      if (!route) {
        throw new Error("Expected MCP status route");
      }

      const response = await route.handler(new Request("http://brain/status"));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ status: "ok", protocol: "stateless" });
    });
  });

  describe("registration", () => {
    it("should register with stdio transport and admin permissions", async () => {
      const plugin = createMcpPlugin({ transport: "stdio" });

      const capabilities = await harness.installPlugin(plugin);

      expect(plugin.id).toBe("mcp");
      expect(capabilities).toBeDefined();
      expect(capabilities.tools.map((tool) => tool.name)).toEqual([
        "chat",
        "confirm",
      ]);
      // Resources are provided by system plugin, not MCP interface
      expect(capabilities.resources).toHaveLength(0);
    });

    it("should register with http transport and admin permissions", async () => {
      installWebserverPlugin();
      const plugin = createMcpPlugin({ transport: "http" });

      const capabilities = await harness.installPlugin(plugin);

      expect(plugin.id).toBe("mcp");
      expect(capabilities).toBeDefined();
      expect(capabilities.tools.map((tool) => tool.name)).toEqual([
        "chat",
        "confirm",
      ]);
      expect(capabilities.resources).toHaveLength(0);
    });
  });

  describe("lifecycle", () => {
    // Routes for each transport are covered under "shared web routes"; these
    // cover the endpoint the transport advertises, which stdio has none of.
    it("advertises no MCP endpoint on stdio transport", async () => {
      const plugin = createMcpPlugin({ transport: "stdio" });

      await harness.installPlugin(plugin);

      expect(
        harness
          .getMockShell()
          .listInteractions()
          .map((interaction) => interaction.id),
      ).not.toContain("mcp");
    });

    it("advertises the /mcp endpoint on http transport", async () => {
      installWebserverPlugin();
      const plugin = createMcpPlugin({ transport: "http" });

      await harness.installPlugin(plugin);

      expect(
        harness
          .getMockShell()
          .listInteractions()
          .map((interaction) => interaction.id),
      ).toContain("mcp");
    });
  });

  describe("daemon management", () => {
    it("should create daemon for lifecycle management", async () => {
      const plugin = createMcpPlugin({ transport: "stdio" });

      await harness.installPlugin(plugin);

      // Verify the plugin has daemon support through its type
      expect(plugin.type).toBe("interface");
    });

    it("should pass the configured protocol mode to the MCP transport", async () => {
      const calls = installMockHttpTransport();
      installWebserverPlugin();
      const plugin = createMcpPlugin({
        transport: "http",
        httpPort: 3001,
        authToken: "test-token",
        mode: "debug",
      });

      await harness.installPlugin(plugin);
      await harness.getMockShell().getDaemonRegistry().startPlugin("mcp");

      expect(calls.protocolModes).toEqual(["debug"]);
      expect(calls.permissionLevels).toEqual(["admin"]);
    });

    it("should reject debug mode for unauthenticated HTTP transport", async () => {
      installMockHttpTransport();
      installWebserverPlugin();
      const plugin = createMcpPlugin({
        transport: "http",
        httpPort: 3001,
        mode: "debug",
      });

      await harness.installPlugin(plugin);

      const startPromise = Promise.resolve(
        harness.getMockShell().getDaemonRegistry().startPlugin("mcp"),
      );

      await startPromise.then(
        () => {
          throw new Error("Expected MCP debug startup to fail");
        },
        (error: unknown) => {
          expect(error).toBeInstanceOf(Error);
          if (!(error instanceof Error)) {
            throw error;
          }
          expect(error.message).toContain(
            "MCP debug mode requires authenticated HTTP transport",
          );
        },
      );
    });

    describe("static bearer token", () => {
      function createProductionHarness(): ReturnType<
        typeof createPluginHarness
      > {
        harness = createPluginHarness({
          logger: createSilentLogger("mcp-test"),
          production: true,
        });
        installWebserverPlugin();
        return harness;
      }

      it("is refused by a production brain with a boot-fatal error", async () => {
        const productionHarness = createProductionHarness();
        const plugin = createMcpPlugin({
          transport: "http",
          authToken: "static-token",
        });

        const refusal = await productionHarness.installPlugin(plugin).then(
          () => undefined,
          (error: unknown) => error,
        );

        expect(refusal).toBeInstanceOf(FatalPluginConfigurationError);
        expect(refusal).toHaveProperty(
          "message",
          "MCP static bearer token (plugins.mcp.authToken / MCP_AUTH_TOKEN) is for local development only; a production brain refuses it. Remove it and connect MCP clients through OAuth with passkeys.",
        );
      });

      it("leaves a production brain with OAuth verification booting", async () => {
        const productionHarness = createProductionHarness();
        productionHarness
          .getMockShell()
          .getAuthRegistry()
          .bindBackend(createMockAuthBackend());
        const plugin = createMcpPlugin({ transport: "http" });

        const capabilities = await productionHarness.installPlugin(plugin);

        expect(capabilities.tools.map((tool) => tool.name)).toEqual([
          "chat",
          "confirm",
        ]);
      });

      it("keeps working outside production", async () => {
        installWebserverPlugin();
        const plugin = createMcpPlugin({
          transport: "http",
          authToken: "static-token",
        });

        const capabilities = await harness.installPlugin(plugin);

        expect(capabilities.tools.map((tool) => tool.name)).toEqual([
          "chat",
          "confirm",
        ]);
      });
    });

    it("should require webserver for http transport", async () => {
      const plugin = createMcpPlugin({
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
