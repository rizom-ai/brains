import { describe, expect, it } from "bun:test";
import {
  createServicePluginContext,
  createMockShell,
  type ServicePluginContext,
  type ToolContext,
} from "@brains/plugins/test";
import { ActionItemAdapter, actionItemSchema } from "@brains/action-items";
import type { ActionItemEntity } from "@brains/action-items";
import { createActionItemCreateTool } from "../src/tools/action-item-create";

const adapter = new ActionItemAdapter();
const NOW = new Date("2026-10-23T09:00:00.000Z");

const members = async (): Promise<{ id: string; name: string }[]> => [
  { id: "usr_jo", name: "Jo" },
  { id: "usr_niels", name: "Niels Ward" },
];

const inChannel: ToolContext = {
  interfaceType: "discord",
  actor: { kind: "user", userId: "usr_niels" },
  displayName: "Niels Ward",
  userPermissionLevel: "trusted",
  conversationId: "discord:1466324999475429386",
  channelId: "1466324999475429386",
  channelName: "executive-room",
};

function brain(): ServicePluginContext {
  const context = createServicePluginContext(createMockShell(), "action-board");
  context.entities.register("action-item", actionItemSchema, adapter);
  return context;
}

async function cards(
  context: ServicePluginContext,
): Promise<ActionItemEntity[]> {
  return context.entityService.listEntities(
    {
      entityType: "action-item",
      options: { filter: { visibilityScope: "restricted" } },
    },
    actionItemSchema,
  );
}

function tool(
  context: ServicePluginContext,
): ReturnType<typeof createActionItemCreateTool> {
  return createActionItemCreateTool(context, {
    visibility: "shared",
    members,
    now: () => NOW,
  });
}

describe("the action_item_create tool", () => {
  it("adds an open card from chat, requested by the caller, from the conversation", async () => {
    const context = brain();

    const result = await tool(context).handler(
      {
        title: "Work on the innovation hub plan",
        details: "Niels is drafting the innovation hub plan.",
        assignee: "nobody",
      },
      inChannel,
    );

    expect(result).toMatchObject({ success: true });
    const [card] = await cards(context);
    if (!card) throw new Error("No card was added");
    expect(card.visibility).toBe("shared");
    expect(card.metadata).toEqual({
      origin: "conversation",
      conversationId: "discord:1466324999475429386",
      interfaceType: "discord",
      channelId: "1466324999475429386",
      channelName: "executive-room",
      capturedAt: "2026-10-23T09:00:00.000Z",
      status: "open",
      requestedBy: [{ name: "Niels Ward", id: "user:usr_niels" }],
    });
    expect(card.content).toContain(
      "# Action item: Work on the innovation hub plan",
    );
    expect(card.content).toContain(
      "Niels is drafting the innovation hub plan.",
    );
  });

  it("assigns the card to the caller who asks for it for themselves", async () => {
    const context = brain();

    await tool(context).handler(
      { title: "Work on the innovation hub plan", assignee: "me" },
      inChannel,
    );

    const [card] = await cards(context);
    expect(card?.metadata.assignedTo).toEqual([
      { name: "Niels Ward", id: "user:usr_niels" },
    ]);
  });

  it("assigns the card to a member named by name", async () => {
    const context = brain();

    await tool(context).handler(
      { title: "Book the venue", assignee: "jo" },
      inChannel,
    );

    const [card] = await cards(context);
    expect(card?.metadata.assignedTo).toEqual([
      { name: "Jo", id: "user:usr_jo" },
    ]);
  });

  it("asks for an assignee, so a card no one is named for says so", async () => {
    const context = brain();

    const result = await tool(context).handler(
      { title: "Book the venue" },
      inChannel,
    );

    expect(result).toMatchObject({ success: false });
    expect(await cards(context)).toEqual([]);
  });

  it("refuses an assignee who is not a member, adding nothing", async () => {
    const context = brain();

    const result = await tool(context).handler(
      { title: "Book the venue", assignee: "Natalie" },
      inChannel,
    );

    expect(result).toMatchObject({ success: false });
    expect(await cards(context)).toEqual([]);
  });

  it("adds the card as from the board when the call has no conversation", async () => {
    const context = brain();

    await tool(context).handler(
      { title: "Book the venue", assignee: "nobody" },
      {
        interfaceType: "mcp",
        actor: { kind: "user", userId: "usr_jo" },
        displayName: "Jo",
        userPermissionLevel: "trusted",
      },
    );

    const [card] = await cards(context);
    expect(card?.metadata).toMatchObject({
      origin: "board",
      requestedBy: [{ name: "Jo", id: "user:usr_jo" }],
    });
  });
});
