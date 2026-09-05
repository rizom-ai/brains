import { createMockShell } from "../../src/test/mock-shell";
import { describe, it, expect } from "bun:test";
import { createBasePluginContext } from "../../src/base/context";

import { createSilentLogger } from "@brains/test-utils";

describe("context.endpoints.register", () => {
  const logger = createSilentLogger();

  it("passes the plugin id through and defaults priority to 100", () => {
    const shell = createMockShell({ logger });
    const context = createBasePluginContext(shell, "my-plugin");

    context.endpoints.register({ label: "Studio", url: "/studio" });

    const endpoints = shell.listEndpoints();
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0]).toEqual({
      label: "Studio",
      url: "/studio",
      pluginId: "my-plugin",
      priority: 100,
      visibility: "public",
    });
  });

  it("respects an explicit priority", () => {
    const shell = createMockShell({ logger });
    const context = createBasePluginContext(shell, "studio");

    context.endpoints.register({
      label: "Studio",
      url: "https://example.com/studio",
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
    context.endpoints.register({
      label: "Studio",
      url: "/studio",
      priority: 30,
    });

    expect(shell.listEndpoints().map((e) => e.label)).toEqual([
      "Site",
      "MCP",
      "Studio",
      "Repo",
    ]);
  });

  it("appears in appInfo.endpoints", async () => {
    const shell = createMockShell({ logger });
    const context = createBasePluginContext(shell, "studio");
    context.endpoints.register({
      label: "Studio",
      url: "/studio",
      priority: 40,
    });

    const info = await shell.getAppInfo();
    expect(info.endpoints.map((e) => e.label)).toEqual(["Studio"]);
    expect(info.endpoints[0]?.pluginId).toBe("studio");
  });

  it("scopes pluginId per context", () => {
    const shell = createMockShell({ logger });
    const studioCtx = createBasePluginContext(shell, "studio");
    const mcpCtx = createBasePluginContext(shell, "mcp");

    studioCtx.endpoints.register({ label: "Studio", url: "/studio" });
    mcpCtx.endpoints.register({ label: "MCP", url: "/mcp" });

    const endpoints = shell.listEndpoints();
    expect(endpoints.find((e) => e.label === "Studio")?.pluginId).toBe(
      "studio",
    );
    expect(endpoints.find((e) => e.label === "MCP")?.pluginId).toBe("mcp");
  });

  it("reports whether another plugin is registered", () => {
    const shell = createMockShell({ logger });
    const context = createBasePluginContext(shell, "admin");

    expect(context.plugins.has("chat")).toBe(false);
    // A real plugin, not an id asserted into one: this test only asks whether
    // the registry reports it, and a stub that cannot register would be a
    // problem the assertion could never see.
    shell.addPlugin({
      id: "chat",
      version: "0.0.0-test",
      type: "interface",
      packageName: "@brains/chat",
      register: async () => ({ tools: [], resources: [] }),
    });
    expect(context.plugins.has("chat")).toBe(true);
  });

  it("preserves endpoint visibility and active-session admission", () => {
    const shell = createMockShell({ logger });
    const context = createBasePluginContext(shell, "studio");

    context.endpoints.register({
      label: "Studio",
      url: "/studio",
      visibility: "public",
      requiresActiveSession: true,
    });

    expect(shell.listEndpoints()[0]).toMatchObject({
      visibility: "public",
      requiresActiveSession: true,
    });
  });

  it("preserves interaction active-session admission", () => {
    const shell = createMockShell({ logger });
    const context = createBasePluginContext(shell, "studio");

    context.interactions.register({
      id: "studio",
      label: "Studio",
      href: "/studio",
      kind: "admin",
      visibility: "public",
      requiresActiveSession: true,
    });

    expect(shell.listInteractions()[0]).toMatchObject({
      visibility: "public",
      requiresActiveSession: true,
    });
  });

  it("registers interactions with defaults and plugin scope", () => {
    const shell = createMockShell({ logger });
    const context = createBasePluginContext(shell, "a2a");

    context.interactions.register({
      id: "a2a",
      label: "A2A",
      href: "/a2a",
      kind: "agent",
    });

    expect(shell.listInteractions()).toEqual([
      {
        id: "a2a",
        label: "A2A",
        href: "/a2a",
        kind: "agent",
        pluginId: "a2a",
        priority: 100,
        visibility: "public",
        status: "available",
      },
    ]);
  });
});
