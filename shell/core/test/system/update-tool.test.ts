import { beforeEach, describe, expect, it } from "bun:test";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";
import type { Tool } from "@brains/mcp-service";

describe("system_update tool", () => {
  let tools: Tool[];
  let services: ReturnType<typeof createMockSystemServices>;

  beforeEach(() => {
    services = createMockSystemServices();
    services.addEntities([
      {
        id: "old-agent.io",
        entityType: "agent",
        content:
          "---\nname: Old Agent\nkind: professional\nurl: https://old-agent.io/a2a\nstatus: active\ndiscoveredAt: 2026-03-10T10:00:00.000Z\ndiscoveredVia: manual\n---\n",
        contentHash: "hash-1",
        metadata: {
          name: "Old Agent",
          url: "https://old-agent.io/a2a",
          status: "active",
        },
        created: new Date("2026-03-10T10:00:00.000Z").toISOString(),
        updated: new Date("2026-03-10T10:00:00.000Z").toISOString(),
      },
      {
        id: "pending-agent.io",
        entityType: "agent",
        content:
          "---\nname: Pending Agent\nkind: professional\nurl: https://pending-agent.io/a2a\nstatus: discovered\ndiscoveredAt: 2026-03-11T10:00:00.000Z\ndiscoveredVia: manual\n---\n",
        contentHash: "hash-2",
        metadata: {
          name: "Pending Agent",
          url: "https://pending-agent.io/a2a",
          status: "discovered",
        },
        created: new Date("2026-03-11T10:00:00.000Z").toISOString(),
        updated: new Date("2026-03-11T10:00:00.000Z").toISOString(),
      },
    ]);
    tools = createSystemTools(services);
  });

  async function exec(input: Record<string, unknown>): Promise<unknown> {
    const tool = tools.find((t) => t.name === "system_update");
    if (!tool) throw new Error("system_update not found");
    return tool.handler(input, {
      interfaceType: "test",
      userId: "test",
    });
  }

  it("normalizes JSON-wrapped field updates passed via content", async () => {
    const result = await exec({
      entityType: "agent",
      id: "old-agent.io",
      content: JSON.stringify({ fields: { status: "archived" } }),
      confirmed: true,
    });

    expect(result).toEqual({
      success: true,
      data: { updated: "old-agent.io" },
    });

    const updated = services.getEntities().get("old-agent.io");
    expect(updated?.metadata["status"]).toBe("archived");
    expect(updated?.content).toContain("name: Old Agent");
    expect(updated?.content).not.toBe(
      JSON.stringify({ fields: { status: "archived" } }),
    );
  });

  it("normalizes plain JSON objects passed via content into field updates", async () => {
    const result = await exec({
      entityType: "agent",
      id: "old-agent.io",
      content: JSON.stringify({ status: "archived" }),
      confirmed: true,
    });

    expect(result).toEqual({
      success: true,
      data: { updated: "old-agent.io" },
    });

    const updated = services.getEntities().get("old-agent.io");
    expect(updated?.metadata["status"]).toBe("archived");
    expect(updated?.content).toContain("name: Old Agent");
  });

  it("auto-approves discovered agents when the model omits fields on a confirmed agent update", async () => {
    const result = await exec({
      entityType: "agent",
      id: "pending-agent.io",
      confirmed: true,
    });

    expect(result).toEqual({
      success: true,
      data: { updated: "pending-agent.io" },
    });

    const updated = services.getEntities().get("pending-agent.io");
    expect(updated?.metadata["status"]).toBe("approved");
  });

  it("rejects blank content replacement for frontmatter entities", async () => {
    const result = await exec({
      entityType: "agent",
      id: "old-agent.io",
      content: " ",
      confirmed: true,
    });

    expect(result).toEqual({
      success: false,
      error:
        "Full content replacement cannot be empty for this entity type. Use 'fields' for partial updates.",
    });

    const updated = services.getEntities().get("old-agent.io");
    expect(updated?.content).toContain("name: Old Agent");
    expect(updated?.metadata["status"]).toBe("active");
  });
});
