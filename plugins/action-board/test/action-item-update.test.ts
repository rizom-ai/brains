import { describe, expect, it } from "bun:test";
import {
  createServicePluginContext,
  createMockShell,
  type ServicePluginContext,
  type ToolContext,
} from "@brains/plugins/test";
import { actionItemAdapter } from "@brains/action-items";
import {
  actionItemSchema,
  type ActionItemMetadata,
} from "@brains/action-items";
import { createActionItemUpdateTool } from "../src/tools/action-item-update";

const adapter = actionItemAdapter;
const NOW = new Date("2026-10-15T12:00:00.000Z");

const chat: ToolContext = {
  interfaceType: "discord",
  actor: { kind: "user", userId: "usr_niels" },
  displayName: "Niels Ward",
  userPermissionLevel: "trusted",
};

async function brain(
  visibility: "shared" | "restricted" = "shared",
): Promise<ServicePluginContext> {
  const context = createServicePluginContext(createMockShell(), "action-board");
  context.entities.register("action-item", actionItemSchema, adapter);
  const metadata: ActionItemMetadata = {
    conversationId: "conv-1",
    channelId: "events",
    interfaceType: "discord",
    capturedAt: "2026-10-10T10:20:00.000Z",
    status: "open",
  };
  await context.entityService.createEntity({
    entity: {
      id: "venue",
      entityType: "action-item",
      visibility,
      content: adapter.composeContent(
        "Action item: Book the venue",
        "Book the venue.",
        metadata,
      ),
      metadata,
    },
  });
  return context;
}

async function stored(
  context: ServicePluginContext,
): Promise<{ status: string; content: string }> {
  const entity = await context.entityService.getEntity(
    { entityType: "action-item", id: "venue", visibilityScope: "restricted" },
    actionItemSchema,
  );
  if (!entity) throw new Error("Missing card");
  return {
    status: entity.metadata.status,
    content: entity.content,
  };
}

describe("the action_item_update tool", () => {
  it("moves a card from chat", async () => {
    const context = await brain();
    const tool = createActionItemUpdateTool(context, () => NOW);

    const result = await tool.handler({ id: "venue", status: "blocked" }, chat);

    expect(result).toMatchObject({ success: true });
    const card = await stored(context);
    expect(card.status).toBe("blocked");
  });

  it("adds a note from chat under the caller's name", async () => {
    const context = await brain();
    const tool = createActionItemUpdateTool(context, () => NOW);

    await tool.handler({ id: "venue", note: "Deposit due Friday." }, chat);

    expect((await stored(context)).content).toContain(
      "- 2026-10-15 · Niels Ward — Deposit due Friday.",
    );
  });

  it("does not reach a card the caller cannot see", async () => {
    const context = await brain("restricted");
    const tool = createActionItemUpdateTool(context, () => NOW);

    expect(
      await tool.handler({ id: "venue", status: "done" }, chat),
    ).toMatchObject({ success: false });
    expect((await stored(context)).status).toBe("open");
  });

  it("finds a card by the title a person calls it", async () => {
    const context = await brain();
    const tool = createActionItemUpdateTool(context, () => NOW);

    const result = await tool.handler(
      { id: "Book the venue", status: "blocked" },
      chat,
    );

    expect(result).toMatchObject({ success: true });
    expect((await stored(context)).status).toBe("blocked");
  });

  it("asks which card when two share the title", async () => {
    const context = await brain();
    const metadata: ActionItemMetadata = {
      conversationId: "conv-2",
      channelId: "events",
      interfaceType: "discord",
      capturedAt: "2026-10-11T10:20:00.000Z",
      status: "open",
    };
    await context.entityService.createEntity({
      entity: {
        id: "venue-2",
        entityType: "action-item",
        visibility: "shared",
        content: adapter.composeContent(
          "Action item: Book the venue",
          "Book the other venue.",
          metadata,
        ),
        metadata,
      },
    });
    const tool = createActionItemUpdateTool(context, () => NOW);

    expect(
      await tool.handler({ id: "Book the venue", status: "done" }, chat),
    ).toEqual({
      success: false,
      error:
        'More than one action item is called "Book the venue": venue, venue-2. Give its id.',
    });
    expect((await stored(context)).status).toBe("open");
  });

  it("asks for a status or a note", async () => {
    const context = await brain();
    const tool = createActionItemUpdateTool(context, () => NOW);

    expect(await tool.handler({ id: "venue" }, chat)).toMatchObject({
      success: false,
    });
  });
});
