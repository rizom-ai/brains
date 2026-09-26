import { describe, expect, it, spyOn } from "bun:test";
import { MCPService } from "@brains/mcp-service";
import { MessageBus } from "@brains/messaging-service";
import { createSilentLogger, waitUntil } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { MCPProtocolAgentService } from "../src/mcp-protocol-agent-service";

function fixture(): { transport: MCPService; bus: MessageBus } {
  const logger = createSilentLogger();
  const bus = MessageBus.createFresh(logger);
  const transport = MCPService.createFresh(bus, logger);
  for (const name of ["mcp_chat", "mcp_confirm"]) {
    transport.registerTool("fixture", {
      name,
      description: name,
      visibility: "public",
      directMcpExposure: "basic",
      inputSchema: {
        message: z.string().optional(),
        conversationId: z.string(),
        approvalId: z.string().optional(),
        confirmed: z.boolean().optional(),
      },
      handler: async () => ({ success: true, data: { text: "unused" } }),
    });
  }
  return { transport, bus };
}

const success = {
  success: true as const,
  data: { success: true, data: { text: "done" } },
};

describe("MCP evaluator boundaries", () => {
  it("retains permission and anchor isolation for supported anonymous calls", async () => {
    const { transport, bus } = fixture();
    const seen: unknown[] = [];
    bus.subscribe("plugin:fixture:tool:execute", (message) => {
      seen.push(
        z
          .object({
            userPermissionLevel: z.string(),
            isAnchor: z.boolean(),
          })
          .parse(message.payload),
      );
      return success;
    });
    const service = await MCPProtocolAgentService.connect(transport);
    const contexts = [
      { userPermissionLevel: "admin", isAnchor: true },
      { userPermissionLevel: "trusted", isAnchor: false },
      { userPermissionLevel: "admin", isAnchor: false },
      { userPermissionLevel: "admin", isAnchor: true },
      { userPermissionLevel: "public", isAnchor: false },
    ] as const;
    try {
      for (const context of contexts) {
        expect((await service.chat("read", "conversation", context)).text).toBe(
          "done",
        );
      }
      expect(seen).toEqual([...contexts]);
    } finally {
      await service.close();
    }
  });

  for (const operation of ["chat", "confirm"] as const) {
    const invoke = (
      service: MCPProtocolAgentService,
      signal?: AbortSignal,
      context: Parameters<
        MCPProtocolAgentService["confirmPendingAction"]
      >[3] = { userPermissionLevel: "trusted" },
    ): ReturnType<MCPProtocolAgentService["chat"]> =>
      operation === "chat"
        ? service.chat("test", "conversation", context, signal)
        : service.confirmPendingAction(
            "conversation",
            true,
            "approval",
            context,
            signal,
          );

    it(`cancels cooperative ${operation} work before it commits`, async () => {
      const { transport, bus } = fixture();
      const started = Promise.withResolvers<void>();
      const gate = Promise.withResolvers<void>();
      let committed = 0;
      let cancelled = false;
      bus.subscribe("plugin:fixture:tool:execute", async (message) => {
        const { signal } = z
          .object({ signal: z.instanceof(AbortSignal) })
          .parse(message.payload);
        signal.addEventListener(
          "abort",
          () => {
            cancelled = true;
          },
          { once: true },
        );
        started.resolve();
        await gate.promise;
        if (!signal.aborted) committed += 1;
        return success;
      });
      const service = await MCPProtocolAgentService.connect(transport);
      const controller = new AbortController();
      const reason = new Error("cancel this evaluation");
      const pending = invoke(service, controller.signal).catch(
        (error: unknown) => error,
      );
      try {
        await started.promise;
        controller.abort(reason);
        await waitUntil(
          () => cancelled,
          "the MCP request to receive cancellation",
        );
        expect(await pending).toBe(reason);
      } finally {
        gate.resolve();
        await pending;
        await service.close();
      }
      expect(committed).toBe(0);
    });

    for (const timing of ["before", "connection"] as const) {
      it(`does not dispatch ${operation} when cancelled ${timing === "before" ? "before invocation" : "during connection setup"}`, async () => {
        const { transport, bus } = fixture();
        let calls = 0;
        bus.subscribe("plugin:fixture:tool:execute", () => {
          calls += 1;
          return success;
        });
        const service = await MCPProtocolAgentService.connect(transport);
        const controller = new AbortController();
        const reason = new Error("stop before dispatch");
        const create = transport.createMcpServer.bind(transport);
        const spy = spyOn(transport, "createMcpServer").mockImplementation(
          (permission) => {
            if (timing === "connection") controller.abort(reason);
            return create(permission);
          },
        );
        try {
          if (timing === "before") controller.abort(reason);
          const result = await invoke(service, controller.signal, {
            userPermissionLevel: "trusted",
            isAnchor: true,
          }).catch((error: unknown) => error);
          expect(result).toBe(reason);
          expect(calls).toBe(0);
          expect(spy).toHaveBeenCalledTimes(timing === "before" ? 0 : 1);
        } finally {
          spy.mockRestore();
          await service.close();
        }
      });
    }

    for (const permission of ["public", "trusted", "admin"] as const) {
      it(`refuses actor-specific ${operation} at ${permission} without dispatch or a new connection`, async () => {
        const { transport, bus } = fixture();
        let calls = 0;
        bus.subscribe("plugin:fixture:tool:execute", () => {
          calls += 1;
          return success;
        });
        const service = await MCPProtocolAgentService.connect(transport);
        const spy = spyOn(transport, "createMcpServer");
        try {
          for (const userId of ["alice", "bob"]) {
            const result = await invoke(service, undefined, {
              userPermissionLevel: permission,
              isAnchor: true,
              actor: {
                identity: { kind: "user", userId },
                interfaceType: "evaluation",
                role: "user",
              },
            }).catch((error: unknown) => error);
            expect(result).toMatchObject({
              message:
                "Basic MCP evaluation does not support actor-specific context; use direct evaluation for identity-scoped cases.",
            });
          }
          expect(calls).toBe(0);
          expect(spy).not.toHaveBeenCalled();
          expect((await invoke(service)).text).toBe("done");
          expect(calls).toBe(1);
        } finally {
          spy.mockRestore();
          await service.close();
        }
      });
    }
  }
});
