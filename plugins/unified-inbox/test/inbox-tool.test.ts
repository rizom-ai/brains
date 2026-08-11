import { describe, expect, it } from "bun:test";
import { InboxRegistry, type InboxItem } from "@brains/plugins";

import {
  InboxDataSource,
  InboxOperatorService,
  createInboxListTool,
  inboxListToolOutputSchema,
} from "../src";

function item(
  id: string,
  urgency: "high" | "normal",
  receivedAt: string,
): InboxItem {
  return {
    id,
    title: `Attention ${id}`,
    summary: `Safe summary ${id}`,
    contact: { label: `Contact ${id} · example.com`, personId: `person-${id}` },
    threadOrdinal: 4,
    receivedAt,
    urgency,
    entityRef: { entityType: "mail-item", entityId: `private-${id}` },
    actions: [{ id: "dismiss", label: "Dismiss" }],
  };
}

function createToolFixture(items?: InboxItem[]): {
  service: InboxOperatorService;
  tool: ReturnType<typeof createInboxListTool>;
} {
  const registry = new InboxRegistry();
  if (items) {
    registry.registerSource("mail-plugin", {
      sourceId: "mail-items",
      displayName: "Email Triage",
      list: async () => items,
      act: async () => undefined,
    });
  }
  registry.finalize();
  const service = new InboxOperatorService(
    registry,
    new InboxDataSource(registry),
  );
  return { service, tool: createInboxListTool(service) };
}

const adminContext = {
  userPermissionLevel: "admin" as const,
  interfaceType: "test",
  actor: { kind: "user" as const, userId: "admin-user" },
};

const attentionItems = [
  item("high", "high", "2026-08-05T10:00:00.000Z"),
  item("normal", "normal", "2026-08-05T09:00:00.000Z"),
];

describe("inbox_list tool", () => {
  it("returns a bounded content-safe field allowlist for Admin callers", async () => {
    const { tool } = createToolFixture(attentionItems);
    const result = inboxListToolOutputSchema.parse(
      await tool.handler(
        { sourceId: "mail-items", urgency: "high", limit: 1 },
        adminContext,
      ),
    );

    expect(result).toEqual({
      success: true,
      data: {
        entries: [
          {
            source: { sourceId: "mail-items", displayName: "Email Triage" },
            item: {
              title: "Attention high",
              summary: "Safe summary high",
              contact: {
                label: "Contact high · example.com",
                personId: "person-high",
              },
              receivedAt: "2026-08-05T10:00:00.000Z",
              urgency: "high",
            },
          },
        ],
        errors: [],
        total: 1,
      },
    });
    expect(tool.name).toBe("inbox_list");
    expect(tool.visibility).toBe("admin");
    expect(tool.sideEffects).toBe("none");
  });

  it("uses the same source and urgency filters as the workspace", async () => {
    const { service, tool } = createToolFixture(attentionItems);
    const workspace = await service.workspace({
      sourceId: "mail-items",
      urgency: "normal",
      offset: 0,
      limit: 50,
    });
    const result = inboxListToolOutputSchema.parse(
      await tool.handler(
        { sourceId: "mail-items", urgency: "normal", limit: 50 },
        adminContext,
      ),
    );

    if (!result.success) throw new Error(result.error);
    expect(result.data.entries).toEqual(
      workspace.entries.map(({ source, item: workspaceItem }) => ({
        source,
        item: {
          title: workspaceItem.title,
          ...(workspaceItem.summary ? { summary: workspaceItem.summary } : {}),
          ...(workspaceItem.contact ? { contact: workspaceItem.contact } : {}),
          receivedAt: workspaceItem.receivedAt,
          urgency: workspaceItem.urgency,
        },
      })),
    );
  });

  it("returns an empty result when no source is registered", async () => {
    const { tool } = createToolFixture();

    expect(await tool.handler({}, adminContext)).toEqual({
      success: true,
      data: { entries: [], errors: [], total: 0 },
    });
  });

  it("omits source locators, actions, bodies, addresses, and hashes", async () => {
    const { tool } = createToolFixture([
      {
        id: "sender-hash-8ab1",
        title: "Safe routing title",
        summary: "Safe routing summary",
        threadOrdinal: 7,
        receivedAt: "2026-08-05T10:00:00.000Z",
        urgency: "high",
        entityRef: {
          entityType: "mail-item",
          entityId: "sender@example.com",
        },
        actions: [
          {
            id: "dismiss",
            label: "Source body: private transport content",
          },
        ],
      },
    ]);

    const serialized = JSON.stringify(await tool.handler({}, adminContext));

    expect(serialized).not.toContain("sender-hash-8ab1");
    expect(serialized).not.toContain("sender@example.com");
    expect(serialized).not.toContain("private transport content");
    expect(serialized).not.toContain("entityRef");
    expect(serialized).not.toContain("actions");
    expect(serialized).not.toContain("threadOrdinal");
  });

  it("rejects non-Admin callers before reading any source", async () => {
    let reads = 0;
    const registry = new InboxRegistry();
    registry.registerSource("mail-plugin", {
      sourceId: "mail-items",
      displayName: "Email Triage",
      list: async () => {
        reads += 1;
        return attentionItems;
      },
      act: async () => undefined,
    });
    registry.finalize();
    const tool = createInboxListTool(
      new InboxOperatorService(registry, new InboxDataSource(registry)),
    );

    const result = await tool.handler(
      {},
      {
        userPermissionLevel: "trusted",
        interfaceType: "test",
        actor: { kind: "user", userId: "trusted-user" },
      },
    );

    expect(result).toEqual({
      success: false,
      error: "Unified inbox requires admin permission",
    });
    expect(reads).toBe(0);
  });
});
