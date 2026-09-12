import { describe, expect, it, spyOn } from "bun:test";
import {
  guestInterfaceType,
  type GuestExecutionPolicy,
} from "@brains/contracts/chat";
import type { ToolContext } from "@brains/mcp-service";
import { ToolContextRoutingSchema } from "@brains/mcp-service";
import { createEntityReadTools } from "../../src/system/entity-read-tools";
import { createMockSystemServices } from "./mock-services";

// Test-only limits, not an enabled production posture.
const execution: GuestExecutionPolicy = {
  maxCostMicroUsd: 100,
  limits: {
    messageCharacters: 4000,
    outputTokens: 10,
    contextTokens: 1000,
    contextBytes: 4000,
    toolSteps: 3,
    toolCalls: 3,
    toolResultCharacters: 4000,
    requestTimeoutSeconds: 1,
    retrieval: { rows: 2, rowBytes: 1000, queryCharacters: 100 },
  },
};
function context(): ToolContext {
  return {
    interfaceType: guestInterfaceType,
    actor: { kind: "agent", agentId: "brain-agent" },
    userPermissionLevel: "public",
    isAnchor: false,
    guestExecution: execution,
    signal: new AbortController().signal,
  };
}

describe("guest read tool boundaries", () => {
  it("requires server-owned limits and a cancellation signal before any source access", async () => {
    const services = createMockSystemServices();
    const source = spyOn(services.entityService, "search").mockResolvedValue(
      [],
    );
    const tool = createEntityReadTools(services).find(
      (tool) => tool.name === "system_search",
    );
    if (!tool) throw new Error("Expected search");
    const { guestExecution: _, ...missingExecution } = context();
    const { signal: __, ...missingSignal } = context();
    try {
      for (const caller of [
        missingExecution,
        missingSignal,
        { ...context(), isAnchor: true },
        { ...context(), userPermissionLevel: "admin" as const },
        { ...context(), interfaceType: "mcp" },
        { ...context(), signal: AbortSignal.abort() },
      ]) {
        expect(
          await tool.handler(
            {
              query: "question",
              scope: { kind: "all" },
              guestExecution: execution,
            },
            caller,
          ),
        ).toMatchObject({ success: false });
      }
      expect(source).not.toHaveBeenCalled();
      const routed = ToolContextRoutingSchema.parse(context());
      expect(routed).not.toHaveProperty("guestExecution");
    } finally {
      source.mockRestore();
    }
  });

  it("forwards public scope, pinned limits and cancellation through every retrieval path", async () => {
    const services = createMockSystemServices();
    const search = spyOn(services.entityService, "search").mockResolvedValue(
      [],
    );
    const get = spyOn(services.entityService, "getEntity").mockResolvedValue(
      null,
    );
    const list = spyOn(
      services.entityService,
      "listEntities",
    ).mockResolvedValue([]);
    const caller = context();
    const options = {
      readBudget: execution.limits.retrieval,
      signal: caller.signal,
    };
    try {
      for (const tool of createEntityReadTools(services)) {
        const input =
          tool.name === "system_search"
            ? { query: "question", scope: { kind: "all" } }
            : { entityType: "doc", id: "missing" };
        await tool.handler(input, caller);
      }
      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            ...options,
            visibilityScope: "public",
          }),
        }),
      );
      expect(get).toHaveBeenCalledWith({
        entityType: "doc",
        id: "missing",
        visibilityScope: "public",
        ...options,
      });
      expect(list).toHaveBeenCalledTimes(4); // three exact fallbacks plus system_list
      for (const [request] of list.mock.calls) {
        expect(request.options).toMatchObject({
          ...options,
          filter: { visibilityScope: "public" },
        });
        expect(request.options?.limit).not.toBe(200);
      }
    } finally {
      search.mockRestore();
      get.mockRestore();
      list.mockRestore();
    }
  });
});
