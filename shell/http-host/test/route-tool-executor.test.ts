import { describe, expect, it } from "bun:test";
import { createExternalActorId } from "@brains/contracts";
import type { RegisteredApiRoute } from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { createRouteToolExecutor } from "../src/route-tool-executor";

function route(tool: string): RegisteredApiRoute {
  return {
    pluginId: "newsletter",
    fullPath: "/api/newsletter/subscribe",
    definition: { path: "/subscribe", method: "POST", tool, public: true },
  };
}

describe("createRouteToolExecutor", () => {
  it("runs the route's tool on its owning plugin as an anonymous external caller of the host", async () => {
    const shell = createMockShell();
    const received: unknown[] = [];
    const senders: string[] = [];
    shell
      .getMessageBus()
      .subscribe("plugin:newsletter:tool:execute", async (message) => {
        received.push(message.payload);
        senders.push(message.source);
        return { success: true, data: { success: true, data: { ok: true } } };
      });
    const executeTool = createRouteToolExecutor(
      shell.getMessageBus(),
      "webserver",
    );

    const response = await executeTool(route("subscribe"), {
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
    expect(senders).toEqual(["webserver"]);
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

    await createRouteToolExecutor(shell.getMessageBus(), "webserver")(
      route("system_create"),
      {},
    );

    expect(payloads).toEqual([
      expect.objectContaining({ toolName: "system_create" }),
    ]);
  });
});
