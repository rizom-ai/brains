import { describe, it, expect } from "bun:test";
import { createBasePluginContext } from "../../src/base/context";
import { createMockShell } from "../../src/test/mock-shell";
import { createSilentLogger } from "@brains/test-utils";

describe("context.endpoints.register", () => {
  const logger = createSilentLogger();

  it("passes the plugin id through and defaults priority to 100", () => {
    const shell = createMockShell({ logger });
    const context = createBasePluginContext(shell, "my-plugin");

    context.endpoints.register({ label: "CMS", url: "/cms" });

    const endpoints = shell.listEndpoints();
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0]).toEqual({
      label: "CMS",
      url: "/cms",
      pluginId: "my-plugin",
      priority: 100,
    });
  });

  it("respects an explicit priority", () => {
    const shell = createMockShell({ logger });
    const context = createBasePluginContext(shell, "admin");

    context.endpoints.register({
      label: "CMS",
      url: "https://example.com/cms",
      priority: 40,
    });

    const [endpoint] = shell.listEndpoints();
    expect(endpoint?.priority).toBe(40);
  });

  it("sorts endpoints by priority then label", () => {
    const shell = createMockShell({ logger });
    const context = createBasePluginContext(shell, "multi");

    context.endpoints.register({ label: "Repo", url: "/repo", priority: 50 });
    context.endpoints.register({ label: "Site", url: "/site", priority: 10 });
    context.endpoints.register({ label: "MCP", url: "/mcp", priority: 30 });
    context.endpoints.register({ label: "CMS", url: "/cms", priority: 30 });

    expect(shell.listEndpoints().map((e) => e.label)).toEqual([
      "Site",
      "CMS",
      "MCP",
      "Repo",
    ]);
  });

  it("appears in appInfo.endpoints", async () => {
    const shell = createMockShell({ logger });
    const context = createBasePluginContext(shell, "admin");
    context.endpoints.register({ label: "CMS", url: "/cms", priority: 40 });

    const info = await shell.getAppInfo();
    expect(info.endpoints.map((e) => e.label)).toEqual(["CMS"]);
    expect(info.endpoints[0]?.pluginId).toBe("admin");
  });

  it("scopes pluginId per context", () => {
    const shell = createMockShell({ logger });
    const adminCtx = createBasePluginContext(shell, "admin");
    const mcpCtx = createBasePluginContext(shell, "mcp");

    adminCtx.endpoints.register({ label: "CMS", url: "/cms" });
    mcpCtx.endpoints.register({ label: "MCP", url: "/mcp" });

    const endpoints = shell.listEndpoints();
    expect(endpoints.find((e) => e.label === "CMS")?.pluginId).toBe("admin");
    expect(endpoints.find((e) => e.label === "MCP")?.pluginId).toBe("mcp");
  });
});
