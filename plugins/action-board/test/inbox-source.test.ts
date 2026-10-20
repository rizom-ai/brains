import { describe, expect, it } from "bun:test";
import {
  createServicePluginContext,
  createMockShell,
  type ServicePluginContext,
} from "@brains/plugins/test";
import { inboxItemSchema, type InboxActor } from "@brains/plugins";
import { ActionItemAdapter } from "@brains/action-items";
import { ActionItemInboxSource } from "../src/inbox-source";
import {
  actionItemSchema,
  type ActionItemMetadata,
  type ActionItemStatus,
} from "@brains/action-items";

const adapter = new ActionItemAdapter();
const admin: InboxActor = {
  permissionLevel: "admin",
};

async function brain(
  cards: {
    id: string;
    text: string;
    status: ActionItemStatus;
  }[],
): Promise<ServicePluginContext> {
  const context = createServicePluginContext(createMockShell(), "action-board");
  context.entities.register("action-item", actionItemSchema, adapter);
  for (const card of cards) {
    const metadata: ActionItemMetadata = {
      conversationId: "conv-1",
      channelId: "events",
      channelName: "events",
      interfaceType: "discord",
      capturedAt: "2026-10-10T10:20:00.000Z",
      status: card.status,
      assignedTo: [{ name: "Sam Rivera" }],
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
  context: ServicePluginContext,
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
    const context = await brain([
      { id: "venue", text: "Book the venue", status: "blocked" },
      { id: "invite", text: "Write the invitation", status: "doing" },
      { id: "date", text: "Pick a date", status: "done" },
    ]);
    const source = new ActionItemInboxSource(context);
    const venue = await context.entityService.getEntity({
      entityType: "action-item",
      id: "venue",
      visibilityScope: "restricted",
    });

    const items = await source.list();

    expect(items.map((item) => item.id)).toEqual(["venue"]);
    const [item] = items;
    if (!item) throw new Error("No blocked item listed");
    expect(inboxItemSchema.parse(item)).toEqual(item);
    expect(item).toMatchObject({
      title: "Book the venue",
      summary: "Sam Rivera · #events",
      // When the card last changed: for a blocked card, when it was blocked.
      receivedAt: venue?.updated,
      urgency: "normal",
      entityRef: { entityType: "action-item", entityId: "venue" },
    });
    expect(item.actions).toEqual([
      { id: "resume", label: "Resume" },
      { id: "done", label: "Done" },
      { id: "drop", label: "Drop", confirm: true },
    ]);
  });

  it("moves the card through the board's write path", async () => {
    const context = await brain([
      { id: "venue", text: "Book the venue", status: "blocked" },
      { id: "tables", text: "Rent tables", status: "blocked" },
      { id: "chairs", text: "Rent chairs", status: "blocked" },
    ]);
    const source = new ActionItemInboxSource(context);

    await source.act("venue", "resume", admin);
    await source.act("tables", "done", admin);
    await source.act("chairs", "drop", admin);

    expect((await stored(context, "venue"))?.status).toBe("doing");
    expect((await stored(context, "tables"))?.status).toBe("done");
    expect((await stored(context, "chairs"))?.status).toBe("dropped");
    expect(await source.list()).toEqual([]);
  });

  it("shows an admin the item text", async () => {
    const source = new ActionItemInboxSource(
      await brain([
        {
          id: "venue",
          text: "Book the venue for the spring gathering",
          status: "blocked",
        },
      ]),
    );

    const detail = await source.resolveDetail(
      "venue",
      { permissionLevel: "admin" },
      new AbortController().signal,
    );

    expect(detail).toEqual({
      kind: "plain",
      text: "Book the venue for the spring gathering",
      truncated: false,
    });
    expect(
      source.resolveDetail(
        "venue",
        { permissionLevel: "trusted" },
        new AbortController().signal,
      ),
    ).rejects.toThrow("admin");
  });

  it("acts only for an admin", async () => {
    const context = await brain([
      { id: "venue", text: "Book the venue", status: "blocked" },
    ]);
    const source = new ActionItemInboxSource(context);

    expect(
      source.act("venue", "resume", { permissionLevel: "trusted" }),
    ).rejects.toThrow("admin");
    expect((await stored(context, "venue"))?.status).toBe("blocked");
  });

  it("refuses an unknown action and a card no longer blocked", async () => {
    const context = await brain([
      { id: "venue", text: "Book the venue", status: "blocked" },
      { id: "invite", text: "Write the invitation", status: "doing" },
    ]);
    const source = new ActionItemInboxSource(context);

    expect(source.act("venue", "archive", admin)).rejects.toThrow(
      "Invalid action-items inbox action",
    );
    expect(source.act("invite", "done", admin)).rejects.toThrow(
      "Action item unavailable",
    );
    expect((await stored(context, "invite"))?.status).toBe("doing");
  });
});
