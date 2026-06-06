import { beforeEach, describe, expect, it } from "bun:test";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";
import type { Tool, ToolResponse } from "@brains/mcp-service";
import { PermissionService } from "@brains/templates";
import { z } from "@brains/utils";

const updateEntityRequestSchema = z
  .object({
    options: z
      .object({
        eventContext: z
          .object({
            conversationId: z.string().optional(),
            channelId: z.string().optional(),
            runId: z.string().optional(),
            toolCallId: z.string().optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .passthrough();

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
      {
        id: "site-info",
        entityType: "site-info",
        content: "---\ntitle: Test Site\n---\n",
        contentHash: "hash-site-info",
        visibility: "public",
        metadata: { title: "Test Site" },
        created: new Date("2026-03-14T10:00:00.000Z").toISOString(),
        updated: new Date("2026-03-14T10:00:00.000Z").toISOString(),
      },
      {
        id: "linkedin-update",
        entityType: "social-post",
        content:
          "---\ntitle: LinkedIn Update\nstatus: draft\n---\n\nPost body.",
        contentHash: "hash-social-draft",
        visibility: "public",
        metadata: { title: "LinkedIn Update", status: "draft" },
        created: new Date("2026-03-15T10:00:00.000Z").toISOString(),
        updated: new Date("2026-03-15T10:00:00.000Z").toISOString(),
      },
      {
        id: "workflow-card",
        entityType: "workflow-card",
        content: "---\ntitle: Workflow Card\nstatus: draft\n---\n\nTask body.",
        contentHash: "hash-workflow-draft",
        visibility: "public",
        metadata: { title: "Workflow Card", status: "draft" },
        created: new Date("2026-03-15T11:00:00.000Z").toISOString(),
        updated: new Date("2026-03-15T11:00:00.000Z").toISOString(),
      },
    ]);
    tools = createSystemTools(services);
  });

  async function exec(
    input: Record<string, unknown>,
    userPermissionLevel: "anchor" | "trusted" | "public" = "anchor",
  ): Promise<ToolResponse> {
    const tool = tools.find((t) => t.name === "system_update");
    if (!tool) throw new Error("system_update not found");
    return tool.handler(input, {
      interfaceType: "test",
      userId: "test",
      userPermissionLevel,
    });
  }

  async function execDelete(
    input: Record<string, unknown>,
    userPermissionLevel: "anchor" | "trusted" | "public" = "anchor",
  ): Promise<ToolResponse> {
    const tool = tools.find((t) => t.name === "system_delete");
    if (!tool) throw new Error("system_delete not found");
    return tool.handler(input, {
      interfaceType: "test",
      userId: "test",
      userPermissionLevel,
    });
  }

  it("passes separate conversation, channel, run, and tool call provenance to confirmed entity updates", async () => {
    const tool = tools.find((candidate) => candidate.name === "system_update");
    if (!tool) throw new Error("system_update not found");

    const result = await tool.handler(
      {
        entityType: "agent",
        id: "old-agent.io",
        fields: { status: "approved" },
        confirmed: true,
        contentHash: "hash-1",
      },
      {
        interfaceType: "test",
        userId: "test",
        conversationId: "conversation-1",
        channelId: "channel-1",
        runId: "run-1",
        toolCallId: "call-1",
        userPermissionLevel: "anchor",
      },
    );

    expect("success" in result && result.success).toBe(true);
    const request = updateEntityRequestSchema.parse(
      services.getLastUpdateRequest(),
    );
    expect(request.options?.eventContext).toEqual({
      conversationId: "conversation-1",
      channelId: "channel-1",
      runId: "run-1",
      toolCallId: "call-1",
    });
  });

  it("uses non-title metadata as the display label in update confirmations", async () => {
    const result = await exec({
      entityType: "newsletter",
      id: "newsletter-1",
      fields: { status: "queued" },
    });

    expect(result).toMatchObject({
      needsConfirmation: true,
      toolName: "system_update",
      summary: expect.stringContaining('Update "Notes on Living Systems"?'),
    });
  });

  it("uses non-title metadata as the display label in delete confirmations", async () => {
    const result = await execDelete({
      entityType: "newsletter",
      id: "newsletter-1",
    });

    expect(result).toMatchObject({
      needsConfirmation: true,
      toolName: "system_delete",
      summary: expect.stringContaining('Delete "Notes on Living Systems"?'),
    });
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
    if (!(typeof confirmation === "object" && "args" in confirmation)) {
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

  it("refuses to delete singleton records even when confirmed", async () => {
    const result = await execDelete({
      entityType: "site-info",
      id: "site-info",
      confirmed: true,
    });

    expect(result).toMatchObject({
      success: false,
      error:
        "site-info is a singleton entity and cannot be deleted through system tools. Update it instead.",
    });
    expect(services.getEntities().get("site-info")).toBeDefined();
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

  it("rejects coverImageId field updates for entity types without cover support", async () => {
    const result = await exec({
      entityType: "agent",
      id: "old-agent.io",
      fields: { coverImageId: "hero-banner" },
      confirmed: true,
    });

    expect(result).toMatchObject({
      success: false,
      error: "Entity type 'agent' doesn't support cover images",
    });
  });

  it("writes coverImageId field updates to frontmatter for entity types with cover support", async () => {
    const result = await exec({
      entityType: "social-post",
      id: "linkedin-update",
      fields: { coverImageId: "hero-banner" },
      confirmed: true,
    });

    expect(result).toEqual({
      success: true,
      data: { updated: "linkedin-update" },
    });
    const updated = services.getEntities().get("linkedin-update");
    expect(updated?.content).toContain("coverImageId: hero-banner");
    expect(updated?.metadata).not.toHaveProperty("coverImageId");
  });

  it("writes ogImageId field updates to frontmatter", async () => {
    const result = await exec({
      entityType: "social-post",
      id: "linkedin-update",
      fields: { ogImageId: "social-card" },
      confirmed: true,
    });

    expect(result).toEqual({
      success: true,
      data: { updated: "linkedin-update" },
    });
    const updated = services.getEntities().get("linkedin-update");
    expect(updated?.content).toContain("ogImageId: social-card");
    expect(updated?.metadata).not.toHaveProperty("ogImageId");
  });

  it("clears coverImageId through system_update fields", async () => {
    services.addEntities([
      {
        id: "covered-post",
        entityType: "social-post",
        content:
          "---\ntitle: Covered Post\nstatus: draft\ncoverImageId: hero-banner\n---\n\nPost body.",
        contentHash: "hash-covered",
        visibility: "public",
        metadata: { title: "Covered Post", status: "draft" },
        created: new Date("2026-03-15T12:00:00.000Z").toISOString(),
        updated: new Date("2026-03-15T12:00:00.000Z").toISOString(),
      },
    ]);

    const result = await exec({
      entityType: "social-post",
      id: "covered-post",
      fields: { coverImageId: null },
      confirmed: true,
    });

    expect(result).toEqual({
      success: true,
      data: { updated: "covered-post" },
    });
    expect(services.getEntities().get("covered-post")?.content).not.toContain(
      "coverImageId",
    );
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

  it("rejects trusted updates when entity action policy requires anchor", async () => {
    services.permissionService = new PermissionService({
      entityActions: {
        agent: { update: "anchor" },
      },
    });

    const result = await exec(
      {
        entityType: "agent",
        id: "old-agent.io",
        fields: { status: "archived" },
      },
      "trusted",
    );

    expect(result).toEqual({
      success: false,
      error:
        "Updating `agent` requires Owner/anchor permission; your current permission is Collaborator/trusted.",
    });
  });

  // Locks the policy check above the confirmation branch: if a future refactor
  // hoisted `confirmed: true` ahead of checkEntityActionPermission, this would catch it.
  it("rejects trusted updates with confirmed: true when policy requires anchor", async () => {
    services.permissionService = new PermissionService({
      entityActions: {
        agent: { update: "anchor" },
      },
    });

    const result = await exec(
      {
        entityType: "agent",
        id: "old-agent.io",
        fields: { status: "archived" },
        confirmed: true,
      },
      "trusted",
    );

    expect(result).toEqual({
      success: false,
      error:
        "Updating `agent` requires Owner/anchor permission; your current permission is Collaborator/trusted.",
    });

    const unchanged = services.getEntities().get("old-agent.io");
    expect(unchanged?.metadata["status"]).toBe("active");
  });

  it("requires publish permission when a publish-aware status enters the publish set", async () => {
    services.permissionService = new PermissionService({
      entityActions: {
        "social-post": { update: "trusted", publish: "anchor" },
      },
    });

    const result = await exec(
      {
        entityType: "social-post",
        id: "linkedin-update",
        fields: { status: "queued" },
      },
      "trusted",
    );

    expect(result).toEqual({
      success: false,
      error:
        "Publishing `social-post` requires Owner/anchor permission; your current permission is Collaborator/trusted.",
    });
  });

  it("requires publish permission when a publish-aware status stays in the publish set", async () => {
    services.permissionService = new PermissionService({
      entityActions: {
        "social-post": { update: "trusted", publish: "anchor" },
      },
    });
    const existing = services.getEntities().get("linkedin-update");
    if (existing) {
      services.getEntities().set("linkedin-update", {
        ...existing,
        metadata: { ...existing.metadata, status: "queued" },
      });
    }

    const result = await exec(
      {
        entityType: "social-post",
        id: "linkedin-update",
        fields: { status: "failed" },
      },
      "trusted",
    );

    expect(result).toEqual({
      success: false,
      error:
        "Publishing `social-post` requires Owner/anchor permission; your current permission is Collaborator/trusted.",
    });
  });

  it("requires publish permission for manual failed retry", async () => {
    services.permissionService = new PermissionService({
      entityActions: {
        "social-post": { update: "trusted", publish: "anchor" },
      },
    });
    const existing = services.getEntities().get("linkedin-update");
    if (existing) {
      services.getEntities().set("linkedin-update", {
        ...existing,
        metadata: { ...existing.metadata, status: "failed" },
      });
    }

    const result = await exec(
      {
        entityType: "social-post",
        id: "linkedin-update",
        fields: { status: "queued" },
      },
      "trusted",
    );

    expect(result).toEqual({
      success: false,
      error:
        "Publishing `social-post` requires Owner/anchor permission; your current permission is Collaborator/trusted.",
    });
  });

  it("does not require publish permission for matching status names on non-publish-aware entity types", async () => {
    services.permissionService = new PermissionService({
      entityActions: {
        "workflow-card": { update: "trusted", publish: "anchor" },
      },
    });

    const result = await exec(
      {
        entityType: "workflow-card",
        id: "workflow-card",
        fields: { status: "queued" },
      },
      "trusted",
    );

    expect(result).toMatchObject({
      needsConfirmation: true,
      toolName: "system_update",
    });
  });

  it("requires publish permission for full content replacements entering the publish set", async () => {
    services.permissionService = new PermissionService({
      entityActions: {
        "social-post": { update: "trusted", publish: "anchor" },
      },
    });

    const result = await exec(
      {
        entityType: "social-post",
        id: "linkedin-update",
        content:
          "---\ntitle: LinkedIn Update\nstatus: queued\n---\n\nPost body.",
      },
      "trusted",
    );

    expect(result).toEqual({
      success: false,
      error:
        "Publishing `social-post` requires Owner/anchor permission; your current permission is Collaborator/trusted.",
    });
  });

  it("rejects trusted deletes when entity action policy requires anchor", async () => {
    services.permissionService = new PermissionService({
      entityActions: {
        "*": { delete: "anchor" },
      },
    });

    const result = await execDelete(
      {
        entityType: "newsletter",
        id: "newsletter-1",
        confirmed: true,
      },
      "trusted",
    );

    expect(result).toEqual({
      success: false,
      error:
        "Deleting `newsletter` requires Owner/anchor permission; your current permission is Collaborator/trusted.",
    });
  });

  it("rejects deletes marked never even for anchor callers", async () => {
    services.permissionService = new PermissionService({
      entityActions: {
        newsletter: { delete: "never" },
      },
    });

    const result = await execDelete(
      {
        entityType: "newsletter",
        id: "newsletter-1",
        confirmed: true,
      },
      "anchor",
    );

    expect(result).toEqual({
      success: false,
      error: "Deleting `newsletter` is not allowed through system tools.",
    });
    expect(services.getEntities().has("newsletter-1")).toBe(true);
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
