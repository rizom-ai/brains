import { afterEach, describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import type { Plugin, WebRouteDefinition } from "@brains/plugins";
import { createSilentLogger } from "@brains/test-utils";
import { createMcpPlugin } from "./mcp-plugin";

function routesOf(plugin: Plugin): WebRouteDefinition[] {
  return "getWebRoutes" in plugin && typeof plugin.getWebRoutes === "function"
    ? plugin.getWebRoutes()
    : [];
}

const toolSurface = [
  {
    name: "chat",
    visibility: "public",
    sideEffects: "writes",
    agentTool: false,
    directMcpExposure: "basic",
    input: ["message", "conversationId"],
  },
  {
    name: "confirm",
    visibility: "public",
    sideEffects: "writes",
    agentTool: false,
    directMcpExposure: "basic",
    input: ["approvalId", "confirmed", "conversationId"],
  },
];

/**
 * What the MCP interface registers, pinned as its class registered it: the
 * chat and confirm tools a client calls, the /mcp routes on the shared
 * host, the endpoint and way in it advertises, its daemon, and the
 * protocol-only registration the eval harness builds from it.
 */
describe("the MCP interface's registered surface", () => {
  const harness = createPluginHarness({ logger: createSilentLogger() });

  afterEach(async () => {
    await harness.reset();
  });

  it.each(["http", "stdio"] as const)(
    "registers plugin mcp with the chat and confirm tools over %s",
    async (transport) => {
      if (transport === "http") harness.getMockShell().serveHttp();
      const plugin = createMcpPlugin({ transport });
      const capabilities = await harness.installPlugin(plugin);

      expect([plugin.id, plugin.type, plugin.packageName]).toEqual([
        "mcp",
        "interface",
        "@brains/mcp",
      ]);
      const surface: unknown = capabilities.tools.map((tool) => ({
        name: tool.name,
        visibility: tool.visibility,
        sideEffects: tool.sideEffects,
        agentTool: tool.agentTool,
        directMcpExposure: tool.directMcpExposure,
        input: Object.keys(tool.inputSchema),
      }));
      expect(surface).toEqual(toolSurface);
      expect(capabilities.resources).toEqual([]);
      expect(
        "requiresDaemonStartup" in plugin &&
          typeof plugin.requiresDaemonStartup === "function"
          ? plugin.requiresDaemonStartup()
          : false,
      ).toBe(false);
      const registry = harness.getMockShell().getDaemonRegistry();
      expect(registry.getAll()).toEqual(["mcp:mcp"]);
      expect(registry.get("mcp:mcp")?.pluginId).toBe("mcp");
      expect(await registry.checkHealth("mcp:mcp")).toEqual({
        status: "error",
        message: "MCP server not running",
        lastCheck: expect.any(Date),
        details: {
          transport,
          mode: "basic",
          url: transport === "http" ? "http://localhost:8080/mcp" : undefined,
          running: false,
        },
      });
    },
  );

  it("over http: the shared-host routes, the MCP endpoint and its way in", async () => {
    harness.getMockShell().serveHttp();
    const plugin = createMcpPlugin({ transport: "http" });
    await harness.installPlugin(plugin);
    const shell = harness.getMockShell();

    expect(
      routesOf(plugin).map(
        (route) =>
          `${route.method ?? "GET"} ${route.path} public=${String(route.public ?? false)}`,
      ),
    ).toEqual([
      "GET /status public=true",
      "GET /mcp public=true",
      "POST /mcp public=true",
      "DELETE /mcp public=true",
      "OPTIONS /mcp public=true",
    ]);
    expect(shell.listEndpoints()).toEqual([
      {
        label: "MCP",
        url: "/mcp",
        priority: 30,
        visibility: "trusted",
        pluginId: "mcp",
      },
    ]);
    expect(shell.listInteractions()).toEqual([
      {
        id: "mcp",
        label: "MCP",
        description:
          "Connect a trusted client through the Model Context Protocol.",
        href: "/mcp",
        kind: "protocol",
        priority: 30,
        visibility: "trusted",
        pluginId: "mcp",
        status: "available",
      },
    ]);
  });

  it("over stdio: no route, endpoint or way in", async () => {
    const plugin = createMcpPlugin({ transport: "stdio" });
    await harness.installPlugin(plugin);
    const shell = harness.getMockShell();

    expect(routesOf(plugin)).toEqual([]);
    expect(shell.listEndpoints()).toEqual([]);
    expect(shell.listInteractions()).toEqual([]);
  });

  it("builds a protocol-only registration under the same id, with the tools alone", async () => {
    const protocol = createMcpPlugin({
      transport: "http",
    }).createProtocolPlugin();
    const capabilities = await harness.installPlugin(protocol);
    const shell = harness.getMockShell();

    expect([protocol.id, protocol.type, protocol.packageName]).toEqual([
      "mcp",
      "interface",
      "@brains/mcp",
    ]);
    expect(capabilities.tools.map((tool) => tool.name)).toEqual([
      "chat",
      "confirm",
    ]);
    expect(routesOf(protocol)).toEqual([]);
    expect(shell.getDaemonRegistry().getAll()).toEqual([]);
    expect(shell.listEndpoints()).toEqual([]);
    expect(shell.listInteractions()).toEqual([]);
  });
});
