import { describe, expect, it } from "bun:test";
import {
  createEntityPluginContext,
  createMockShell,
  type EntityPluginContext,
} from "@brains/plugins/test";
import { inboxItemSchema, type InboxActionActor } from "@brains/plugins";
import { ActionItemAdapter } from "../../src/adapters/conversation-memory-adapters";
import { ActionItemInboxSource } from "../../src/lib/action-item-inbox-source";
import {
  actionItemSchema,
  type ActionItemHistoryEntry,
  type ActionItemMetadata,
  type ActionItemStatus,
} from "../../src/schemas/conversation-memory";

const NOW = new Date("2026-10-15T12:00:00.000Z");
const adapter = new ActionItemAdapter();
const admin: InboxActionActor = {
  permissionLevel: "admin",
  actor: { kind: "user", userId: "usr_admin" },
};

function blockedHistory(at: string): ActionItemHistoryEntry[] {
  return [
    {
      at,
      actor: { kind: "user", userId: "u-sam" },
      from: "open",
      to: "blocked",
    },
  ];
}

async function brain(
  cards: {
    id: string;
    text: string;
    status: ActionItemStatus;
    history?: ActionItemHistoryEntry[];
  }[],
): Promise<EntityPluginContext> {
  const context = createEntityPluginContext(
    createMockShell(),
    "conversation-memory",
  );
  context.entities.register("action-item", actionItemSchema, adapter);
  for (const card of cards) {
    const metadata: ActionItemMetadata = {
      conversationId: "conv-1",
      channelId: "events",
      channelName: "events",
      interfaceType: "discord",
      spaceId: "discord:events",
      timeRange: {
        start: "2026-10-10T10:00:00.000Z",
        end: "2026-10-10T10:20:00.000Z",
      },
      sourceSummaryId: "conv-1",
      sourceMessageCount: 3,
      projectionVersion: 1,
      status: card.status,
      assignedTo: [{ displayName: "Sam Rivera" }],
      ...(card.history ? { history: card.history } : {}),
    };
    await context.entityService.createEntity({
      entity: {
        id: card.id,
        entityType: "action-item",
        visibility: "shared",
        content: adapter.composeContent(
          `Action item: ${card.text}`,
          card.text,
          metadata,
        ),
        metadata,
      },
    });
  }
  return context;
}

async function stored(
  context: EntityPluginContext,
  id: string,
): Promise<ActionItemMetadata | undefined> {
  return (
    await context.entityService.getEntity(
      { entityType: "action-item", id, visibilityScope: "restricted" },
      actionItemSchema,
    )
  )?.metadata;
}

describe("the action-items Inbox source", () => {
  it("lists blocked items only, as valid Inbox items pointing at the card", async () => {
    const source = new ActionItemInboxSource(
      await brain([
        {
          id: "venue",
          text: "Book the venue",
          status: "blocked",
          history: blockedHistory("2026-10-15T07:00:00.000Z"),
        },
        { id: "invite", text: "Write the invitation", status: "doing" },
        { id: "date", text: "Pick a date", status: "done" },
      ]),
      () => NOW,
    );

    const items = await source.list();

    expect(items.map((item) => item.id)).toEqual(["venue"]);
    const [item] = items;
    if (!item) throw new Error("No blocked item listed");
    expect(inboxItemSchema.parse(item)).toEqual(item);
    expect(item).toMatchObject({
      title: "Book the venue",
      summary: "Blocked 5h · Sam Rivera · #events",
      receivedAt: "2026-10-15T07:00:00.000Z",
      urgency: "normal",
      entityRef: { entityType: "action-item", entityId: "venue" },
    });
    expect(item.actions).toEqual([
      { id: "resume", label: "Resume" },
      { id: "done", label: "Done" },
      { id: "drop", label: "Drop", confirm: true },
    ]);
  });

  it("moves the card through the board's write path, naming the admin", async () => {
    const context = await brain([
      { id: "venue", text: "Book the venue", status: "blocked" },
      { id: "tables", text: "Rent tables", status: "blocked" },
      { id: "chairs", text: "Rent chairs", status: "blocked" },
    ]);
    const source = new ActionItemInboxSource(context, () => NOW);

    await source.act("venue", "resume", admin);
    await source.act("tables", "done", admin);
    await source.act("chairs", "drop", admin);

    expect((await stored(context, "venue"))?.status).toBe("doing");
    expect((await stored(context, "tables"))?.status).toBe("done");
    expect((await stored(context, "chairs"))?.status).toBe("dropped");
    expect((await stored(context, "venue"))?.history).toEqual([
      {
        at: NOW.toISOString(),
        actor: { kind: "user", userId: "usr_admin" },
        from: "blocked",
        to: "doing",
      },
    ]);
    expect(await source.list()).toEqual([]);
  });

  it("acts only for an admin", async () => {
    const context = await brain([
      { id: "venue", text: "Book the venue", status: "blocked" },
    ]);
    const source = new ActionItemInboxSource(context, () => NOW);

    expect(
      source.act("venue", "resume", {
        permissionLevel: "trusted",
        actor: { kind: "user", userId: "usr_trusted" },
      }),
    ).rejects.toThrow("admin");
    expect((await stored(context, "venue"))?.status).toBe("blocked");
  });

  it("refuses an unknown action and a card no longer blocked", async () => {
    const context = await brain([
      { id: "venue", text: "Book the venue", status: "blocked" },
      { id: "invite", text: "Write the invitation", status: "doing" },
    ]);
    const source = new ActionItemInboxSource(context, () => NOW);

    expect(source.act("venue", "archive", admin)).rejects.toThrow(
      "Invalid action-items inbox action",
    );
    expect(source.act("invite", "done", admin)).rejects.toThrow(
      "Action item unavailable",
    );
    expect((await stored(context, "invite"))?.status).toBe("doing");
  });
});
