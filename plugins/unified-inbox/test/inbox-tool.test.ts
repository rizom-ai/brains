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
    receivedAt,
    urgency,
    actions: [{ id: "dismiss", label: "Dismiss" }],
  };
}

function createToolFixture(): ReturnType<typeof createInboxListTool> {
  const registry = new InboxRegistry();
  registry.registerSource("mail-plugin", {
    sourceId: "mail-items",
    displayName: "Email Triage",
    list: async () => [
      item("high", "high", "2026-08-05T10:00:00.000Z"),
      item("normal", "normal", "2026-08-05T09:00:00.000Z"),
    ],
    act: async () => undefined,
  });
  registry.finalize();
  return createInboxListTool(
    new InboxOperatorService(registry, new InboxDataSource(registry)),
  );
}

const adminContext = {
  userPermissionLevel: "admin" as const,
  interfaceType: "test",
  actor: { kind: "user" as const, userId: "admin-user" },
};

describe("inbox_list tool", () => {
  it("returns bounded filtered live projections for Admin callers", async () => {
    const tool = createToolFixture();
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
              id: "high",
              title: "Attention high",
              receivedAt: "2026-08-05T10:00:00.000Z",
              urgency: "high",
              actions: [{ id: "dismiss", label: "Dismiss" }],
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

  it("rejects non-Admin callers before reading any source", async () => {
    const tool = createToolFixture();
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
  });
});
