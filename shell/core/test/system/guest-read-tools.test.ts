import { describe, expect, it, spyOn } from "bun:test";
import { guestInterfaceType } from "@brains/contracts/chat";
import type { ToolContext } from "@brains/mcp-service";
import { createEntityReadTools } from "../../src/system/entity-read-tools";
import { createMockSystemServices } from "./mock-services";

function context(): ToolContext {
  return {
    interfaceType: guestInterfaceType,
    actor: { kind: "agent", agentId: "brain-agent" },
    userPermissionLevel: "public",
    isAnchor: false,
  };
}

describe("guest read tool boundaries", () => {
  it("refuses a guest caller that claims more than public reach before any source access", async () => {
    const services = createMockSystemServices();
    const source = spyOn(services.entityService, "search").mockResolvedValue(
      [],
    );
    const tool = createEntityReadTools(services).find(
      (tool) => tool.name === "system_search",
    );
    if (!tool) throw new Error("Expected search");
    try {
      for (const caller of [
        { ...context(), isAnchor: true },
        { ...context(), userPermissionLevel: "admin" as const },
      ]) {
        expect(
          await tool.handler(
            { query: "question", scope: { kind: "all" } },
            caller,
          ),
        ).toMatchObject({ success: false });
      }
      expect(source).not.toHaveBeenCalled();
    } finally {
      source.mockRestore();
    }
  });

  it("reads only public entities through every retrieval path", async () => {
    const services = createMockSystemServices();
    services.registerEntityTypes(["note"]);
    const search = spyOn(services.entityService, "search").mockResolvedValue(
      [],
    );
    const get = spyOn(services.entityService, "getEntityRaw").mockResolvedValue(
      null,
    );
    const list = spyOn(
      services.entityService,
      "listEntities",
    ).mockResolvedValue([]);
    try {
      for (const tool of createEntityReadTools(services)) {
        const input =
          tool.name === "system_search"
            ? { query: "question", scope: { kind: "all" } }
            : { entityType: "note", id: "missing" };
        await tool.handler(input, context());
      }
      expect(search).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ visibilityScope: "public" }),
        }),
      );
      expect(get).toHaveBeenCalledWith(
        expect.objectContaining({ visibilityScope: "public" }),
      );
      expect(list.mock.calls.length).toBeGreaterThan(0);
      for (const [request] of list.mock.calls) {
        expect(request.options?.filter).toMatchObject({
          visibilityScope: "public",
        });
      }
    } finally {
      search.mockRestore();
      get.mockRestore();
      list.mockRestore();
    }
  });
});
