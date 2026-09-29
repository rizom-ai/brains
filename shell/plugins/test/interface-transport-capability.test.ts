import { describe, expect, it, spyOn } from "bun:test";
import { MCPService, type IMCPTransport } from "@brains/mcp-service";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { defineInterface, instantiatePluginPackageDefinition } from "../src";
import { createPluginHarness } from "../src/test/harness";

describe("interface MCP transport capability", () => {
  it("binds transport operations without exposing the live MCP service", async () => {
    const configuredSpaces = ["chat"];
    const harness = createPluginHarness({ spaces: configuredSpaces });
    const shell = harness.getMockShell();
    const service = MCPService.createFresh(
      shell.getMessageBus(),
      createSilentLogger(),
    );
    spyOn(shell, "getMCPService").mockReturnValue(service);
    const servers = new Set<ReturnType<IMCPTransport["getMcpServer"]>>([
      service.getMcpServer(),
    ]);
    let inspected = false;
    try {
      const definition = defineInterface(
        {
          id: "protocol",
          config: z.object({}),
          setup: ({ mcpTransport, spaces }) => {
            expect(spaces).toEqual(["chat"]);
            expect(spaces).not.toBe(configuredSpaces);
            expect(Object.isFrozen(spaces)).toBe(true);
            expect(Reflect.set(spaces, "0", "changed")).toBe(false);
            expect(configuredSpaces).toEqual(["chat"]);
            expect(Object.isFrozen(mcpTransport)).toBe(true);
            expect(Object.keys(mcpTransport).sort()).toEqual([
              "createMcpServer",
              "getMcpServer",
              "setAnchorStatus",
              "setPermissionLevel",
              "setProtocolMode",
            ]);
            for (const member of [
              "messageBus",
              "logger",
              "registeredTools",
              "mcpServer",
              "registerTool",
              "unregisterPlugin",
              "getInstructions",
            ]) {
              expect(mcpTransport).not.toHaveProperty(member);
            }
            expect(mcpTransport).not.toBeInstanceOf(MCPService);
            expect(mcpTransport.constructor).not.toHaveProperty("createFresh");
            expect(Reflect.set(mcpTransport, "permissionLevel", "admin")).toBe(
              false,
            );
            const {
              getMcpServer,
              createMcpServer,
              setPermissionLevel,
              setProtocolMode,
              setAnchorStatus,
            } = mcpTransport;
            expect(getMcpServer()).toBe(service.getMcpServer());
            setPermissionLevel("public");
            servers.add(getMcpServer());
            expect(Reflect.get(service, "permissionLevel")).toBe("public");
            setProtocolMode("debug");
            servers.add(getMcpServer());
            expect(Reflect.get(service, "protocolMode")).toBe("debug");
            if (!setAnchorStatus)
              throw new Error("Anchor operation was omitted");
            setAnchorStatus(true);
            servers.add(getMcpServer());
            expect(Reflect.get(service, "isAnchor")).toBe(true);
            const fresh = createMcpServer("trusted");
            servers.add(fresh);
            expect(fresh).not.toBe(getMcpServer());
            // Returning the protocol SDK server remains an intentional transport capability.
            expect(typeof fresh.connect).toBe("function");
            expect(typeof service.registerTool).toBe("function");
            inspected = true;
            return {};
          },
        },
        {},
      );
      const [plugin] = instantiatePluginPackageDefinition(
        definition,
        {},
        { name: "@fixture/protocol", version: "0.1.0" },
      );
      if (!plugin) throw new Error("Protocol interface was not created");
      await harness.installPlugin(plugin);
      expect(inspected).toBe(true);
    } finally {
      try {
        await harness.reset();
      } finally {
        servers.add(service.getMcpServer());
        await Promise.all([...servers].map((server) => server.close()));
      }
    }
  });
});
