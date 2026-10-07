import { describe, expect, it, spyOn } from "bun:test";
import {
  instantiatePluginPackageDefinition,
  type Plugin,
  type ProtocolPluginProvider,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import mcpPackage from "../src";
import packageJson from "../package.json";

function protocolProvider(
  plugin: Plugin,
): plugin is Plugin & ProtocolPluginProvider {
  return (
    "createProtocolPlugin" in plugin &&
    typeof plugin.createProtocolPlugin === "function"
  );
}

describe("declarative MCP protocol-only registration", () => {
  it.each(["http", "stdio"] as const)(
    "preserves the %s protocol without hosting it",
    async (transport) => {
      const hosted = instantiatePluginPackageDefinition(
        mcpPackage,
        { transport, authToken: "host-only-secret" },
        packageJson,
      )[0];
      if (!hosted || !protocolProvider(hosted))
        throw new Error("Missing protocol provider");
      const protocol = hosted.createProtocolPlugin();
      const second = hosted.createProtocolPlugin();
      expect(protocol).not.toBe(second);
      expect(protocol.id).toBe("@brains/mcp:mcp");
      expect(protocol.packageName).toBe(hosted.packageName);
      expect(protocol.version).toBe(hosted.version);
      expect(Reflect.get(protocol, "config")).toEqual({ mode: "basic" });
      const harness = createPluginHarness();
      const shell = harness.getMockShell();
      const mode = spyOn(shell.getMCPService(), "setProtocolMode");
      const permission = spyOn(shell.getMCPService(), "setPermissionLevel");
      try {
        const capabilities = await harness.installPlugin(protocol);
        expect(capabilities.tools.map((tool) => tool.name)).toEqual([
          "mcp_chat",
          "mcp_confirm",
        ]);
        expect(protocol.getWebRoutes?.()).toEqual([]);
        expect(shell.getDaemonRegistry().getAll()).toEqual([]);
        expect(shell.listEndpoints()).toEqual([]);
        expect(shell.listInteractions()).toEqual([]);
        expect(mode.mock.calls).toEqual([["basic"]]);
        expect(permission).not.toHaveBeenCalled();
      } finally {
        await harness.reset();
      }
      const next = createPluginHarness();
      try {
        expect(
          (await next.installPlugin(second)).tools.map((tool) => tool.name),
        ).toEqual(["mcp_chat", "mcp_confirm"]);
        expect(second.getWebRoutes?.()).toEqual([]);
      } finally {
        await next.reset();
      }
      const hostHarness = createPluginHarness();
      try {
        await hostHarness.installPlugin(hosted);
        expect(hosted.getWebRoutes?.()).toHaveLength(
          transport === "http" ? 5 : 0,
        );
        expect(
          hostHarness.getMockShell().getDaemonRegistry().getAll(),
        ).toHaveLength(1);
      } finally {
        await hostHarness.reset();
      }
    },
  );
  it("preserves debug selection without granting host permissions", async () => {
    const hosted = instantiatePluginPackageDefinition(
      mcpPackage,
      { mode: "debug", authToken: "secret" },
      packageJson,
    )[0];
    if (!hosted || !protocolProvider(hosted))
      throw new Error("Missing provider");
    const harness = createPluginHarness();
    const mode = spyOn(
      harness.getMockShell().getMCPService(),
      "setProtocolMode",
    );
    const permission = spyOn(
      harness.getMockShell().getMCPService(),
      "setPermissionLevel",
    );
    try {
      const protocol = hosted.createProtocolPlugin();
      await harness.installPlugin(protocol);
      expect(mode.mock.calls).toEqual([["debug"]]);
      expect(permission).not.toHaveBeenCalled();
      expect(protocol.getWebRoutes?.()).toEqual([]);
      expect(Reflect.get(protocol, "config")).toEqual({ mode: "debug" });
    } finally {
      await harness.reset();
    }
  });
});
