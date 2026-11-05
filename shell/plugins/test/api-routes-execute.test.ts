import { describe, expect, it } from "bun:test";
import { createExternalActorId } from "@brains/contracts";
import type { RegisteredApiRoute } from "../src";
import { createInterfacePluginContext } from "../src/interface/context";
import { createMockShell } from "../src/test/mock-shell";

function route(tool: string): RegisteredApiRoute {
  return {
    pluginId: "newsletter",
    fullPath: "/api/newsletter/subscribe",
    definition: { path: "/subscribe", method: "POST", tool, public: true },
  };
}

describe("context.apiRoutes.executeTool", () => {
  it("runs the route's tool on its owning plugin as an anonymous external caller", async () => {
    const shell = createMockShell();
    const received: unknown[] = [];
    shell
      .getMessageBus()
      .subscribe("plugin:newsletter:tool:execute", async (message) => {
        received.push(message.payload);
        return { success: true, data: { success: true, data: { ok: true } } };
      });
    const context = createInterfacePluginContext(shell, "webserver");

    const response = await context.apiRoutes.executeTool(route("subscribe"), {
      email: "reader@example.com",
    });

    expect(received).toEqual([
      {
        toolName: "newsletter_subscribe",
        args: { email: "reader@example.com" },
        interfaceType: "webserver",
        actor: {
          kind: "external",
          externalActorId: createExternalActorId("webserver", "anonymous"),
        },
      },
    ]);
    expect(response).toEqual({
      success: true,
      data: { success: true, data: { ok: true } },
    });
  });

  it("keeps a canonical tool name the route names exactly", async () => {
    const shell = createMockShell();
    const payloads: unknown[] = [];
    shell
      .getMessageBus()
      .subscribe("plugin:newsletter:tool:execute", async (message) => {
        payloads.push(message.payload);
        return { success: true };
      });

    await createInterfacePluginContext(
      shell,
      "webserver",
    ).apiRoutes.executeTool(route("system_create"), {});

    expect(payloads).toEqual([
      expect.objectContaining({ toolName: "system_create" }),
    ]);
  });
});
