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
        visibility: "public",
        metadata: {
          name: "Old Agent",
          url: "https://old-agent.io/a2a",
          status: "active",
        },
        created: new Date("2026-03-10T10:00:00.000Z").toISOString(),
        updated: new Date("2026-03-10T10:00:00.000Z").toISOString(),
      },
      {
        id: "approved-agent.io",
        entityType: "agent",
        content:
          "---\nname: Approved Agent\nkind: professional\nurl: https://approved-agent.io/a2a\nstatus: approved\ndiscoveredAt: 2026-03-11T09:00:00.000Z\ndiscoveredVia: manual\n---\n",
        contentHash: "hash-approved",
        visibility: "public",
        metadata: {
          name: "Approved Agent",
          url: "https://approved-agent.io/a2a",
          status: "approved",
        },
        created: new Date("2026-03-11T09:00:00.000Z").toISOString(),
        updated: new Date("2026-03-11T09:00:00.000Z").toISOString(),
      },
      {
        id: "pending-agent.io",
        entityType: "agent",
        content:
          "---\nname: Pending Agent\nkind: professional\nurl: https://pending-agent.io/a2a\nstatus: discovered\ndiscoveredAt: 2026-03-11T10:00:00.000Z\ndiscoveredVia: manual\n---\n",
        contentHash: "hash-2",
        visibility: "public",
        metadata: {
          name: "Pending Agent",
          url: "https://pending-agent.io/a2a",
          status: "discovered",
        },
        created: new Date("2026-03-11T10:00:00.000Z").toISOString(),
        updated: new Date("2026-03-11T10:00:00.000Z").toISOString(),
      },
      {
        id: "newsletter-1",
        entityType: "newsletter",
        content:
          "---\nsubject: Notes on Living Systems\nstatus: draft\n---\n\nNewsletter body.",
        contentHash: "hash-4",
        visibility: "public",
        metadata: {
          subject: "Notes on Living Systems",
          status: "draft",
        },
        created: new Date("2026-03-13T10:00:00.000Z").toISOString(),
        updated: new Date("2026-03-13T10:00:00.000Z").toISOString(),
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
      userPermissionLevel: "anchor",
    });
  }

  async function execDelete(input: Record<string, unknown>): Promise<unknown> {
    const tool = tools.find((t) => t.name === "system_delete");
    if (!tool) throw new Error("system_delete not found");
    return tool.handler(input, {
      interfaceType: "test",
      userId: "test",
      userPermissionLevel: "anchor",
    });
  }

  it("uses non-title metadata as the display label in update confirmations", async () => {
    const result = await exec({
      entityType: "newsletter",
      id: "newsletter-1",
      fields: { status: "queued" },
    });

    expect(result).toMatchObject({
      needsConfirmation: true,
      toolName: "system_update",
    });
    expect((result as { description: string }).description).toContain(
      'Update "Notes on Living Systems"?',
    );
  });

  it("uses non-title metadata as the display label in delete confirmations", async () => {
    const result = await execDelete({
      entityType: "newsletter",
      id: "newsletter-1",
    });

    expect(result).toMatchObject({
      needsConfirmation: true,
      toolName: "system_delete",
    });
    expect((result as { description: string }).description).toContain(
      'Delete "Notes on Living Systems"?',
    );
  });

  it("does not delete when confirmed is passed without a pending confirmation token", async () => {
    const result = await execDelete({
      entityType: "newsletter",
      id: "newsletter-1",
      confirmed: true,
    });

    expect(result).toMatchObject({
      needsConfirmation: true,
      toolName: "system_delete",
    });
    expect(services.getEntities().get("newsletter-1")).toBeDefined();
  });

  it("deletes after the pending confirmation args are submitted", async () => {
    const confirmation = await execDelete({
      entityType: "newsletter",
      id: "newsletter-1",
    });
    if (
      !(
        typeof confirmation === "object" &&
        confirmation &&
        "args" in confirmation
      )
    ) {
      throw new Error("Expected delete confirmation args");
    }

    const result = await execDelete(
      confirmation.args as Record<string, unknown>,
    );

    expect(result).toMatchObject({
      success: true,
      data: { deleted: "newsletter-1" },
    });
    expect(services.getEntities().get("newsletter-1")).toBeUndefined();
  });

  it("refuses to delete protected identity records even when confirmed", async () => {
    const result = await execDelete({
      entityType: "brain-character",
      id: "brain-character",
      confirmed: true,
    });

    expect(result).toMatchObject({
      success: false,
      error:
        "brain-character is a protected identity/profile record and cannot be deleted. Update it instead.",
    });
  });

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

  it("updates visibility as a top-level field and normalizes private", async () => {
    const result = await exec({
      entityType: "agent",
      id: "old-agent.io",
      fields: { visibility: "private" },
      confirmed: true,
    });

    expect(result).toEqual({
      success: true,
      data: { updated: "old-agent.io" },
    });

    const updated = services.getEntities().get("old-agent.io");
    expect(updated?.visibility).toBe("restricted");
    expect(updated?.metadata).not.toHaveProperty("visibility");
  });

  it("re-parses visibility from frontmatter on full content replacement", async () => {
    const newMarkdown =
      "---\nname: Old Agent\nkind: professional\nurl: https://old-agent.io/a2a\nstatus: active\ndiscoveredAt: 2026-03-10T10:00:00.000Z\ndiscoveredVia: manual\nvisibility: private\n---\n";

    const result = await exec({
      entityType: "agent",
      id: "old-agent.io",
      content: newMarkdown,
      confirmed: true,
    });

    expect(result).toEqual({
      success: true,
      data: { updated: "old-agent.io" },
    });

    const updated = services.getEntities().get("old-agent.io");
    expect(updated?.visibility).toBe("restricted");
  });

  it("clears non-default visibility when replacement markdown omits the field", async () => {
    // Seed agent as restricted, then replace with markdown that has no visibility key.
    const restricted = services.getEntities().get("old-agent.io");
    if (restricted) {
      services.getEntities().set("old-agent.io", {
        ...restricted,
        visibility: "restricted",
      });
    }

    const newMarkdown =
      "---\nname: Old Agent\nkind: professional\nurl: https://old-agent.io/a2a\nstatus: active\ndiscoveredAt: 2026-03-10T10:00:00.000Z\ndiscoveredVia: manual\n---\n";

    const result = await exec({
      entityType: "agent",
      id: "old-agent.io",
      content: newMarkdown,
      confirmed: true,
    });

    expect(result).toEqual({
      success: true,
      data: { updated: "old-agent.io" },
    });

    const updated = services.getEntities().get("old-agent.io");
    expect(updated?.visibility).toBe("public");
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

  it("auto-approves discovered agents when the model sends blank content on a confirmed update", async () => {
    const result = await exec({
      entityType: "agent",
      id: "pending-agent.io",
      content: " ",
      confirmed: true,
    });

    expect(result).toEqual({
      success: true,
      data: { updated: "pending-agent.io" },
    });

    const updated = services.getEntities().get("pending-agent.io");
    expect(updated?.metadata["status"]).toBe("approved");
  });

  it("treats approval without fields as idempotent when the agent is already approved", async () => {
    const result = await exec({
      entityType: "agent",
      id: "approved-agent.io",
      confirmed: true,
    });

    expect(result).toEqual({
      success: true,
      data: { updated: "approved-agent.io" },
    });

    const updated = services.getEntities().get("approved-agent.io");
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
