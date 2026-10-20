import { describe, expect, it } from "bun:test";
import {
  createServicePluginContext,
  createMockShell,
  type ServicePluginContext,
} from "@brains/plugins/test";
import type {
  StudioWorkspaceActor,
  StudioWorkspaceRegistration,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { ActionItemAdapter } from "@brains/action-items";
import { registerBoardWorkspace } from "../src/board-workspace";
import {
  actionItemSchema,
  type ActionItemMetadata,
  type ActionItemStatus,
} from "@brains/action-items";

const NOW = new Date("2026-10-15T12:00:00.000Z");
const adapter = new ActionItemAdapter();

const niels: StudioWorkspaceActor = {
  interfaceType: "studio",
  userId: "u-niels",
  displayName: "Niels Ward",
  actor: { kind: "user", userId: "u-niels" },
  userPermissionLevel: "trusted",
  visibilityScope: "shared",
  isAnchor: false,
};

interface Card {
  id: string;
  text: string;
  status: ActionItemStatus;
  /** When the conversation it came from ended. */
  capturedDaysAgo?: number;
  assignee?: string;
}

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

async function brain(cards: Card[]): Promise<ServicePluginContext> {
  const context = createServicePluginContext(createMockShell(), "action-board");
  context.entities.register("action-item", actionItemSchema, adapter);
  for (const card of cards) {
    const metadata: ActionItemMetadata = {
      conversationId: "conv-1",
      channelId: "events",
      channelName: "events",
      interfaceType: "discord",
      capturedAt: daysAgo(card.capturedDaysAgo ?? 5),
      status: card.status,
      ...(card.assignee ? { assignedTo: [{ name: card.assignee }] } : {}),
    };
    await context.entityService.createEntity({
      entity: {
        id: card.id,
        entityType: "action-item",
        visibility: "shared",
        // Synced files keep a blank line between frontmatter and heading.
        content: adapter
          .composeContent(`Action item: ${card.text}`, card.text, metadata)
          .replace(/\n---\n#/, "\n---\n\n#"),
        metadata,
      },
    });
  }
  return context;
}

async function registered(
  context: ServicePluginContext,
): Promise<StudioWorkspaceRegistration> {
  let registration: StudioWorkspaceRegistration | undefined;
  context.messaging.subscribe<
    StudioWorkspaceRegistration,
    { workspaceUrl: string }
  >("studio:register-workspace", async (message) => {
    registration = message.payload;
    return {
      success: true,
      data: { workspaceUrl: "/studio/workspaces/action-board%3Aboard" },
    };
  });
  await registerBoardWorkspace(context, {
    now: () => NOW,
    visibility: "shared",
  });
  if (!registration) throw new Error("Board was not registered");
  return registration;
}

const itemSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  metadata: z.array(z.string()).optional(),
  badges: z.array(z.object({ label: z.string() })).optional(),
  links: z
    .array(z.object({ label: z.string(), target: z.unknown() }))
    .optional(),
  actionsLabel: z.string().optional(),
  actions: z
    .array(
      z.object({
        label: z.string().optional(),
        input: z.unknown(),
        dropTarget: z.string().optional(),
      }),
    )
    .optional(),
});
const matrixSchema = z.looseObject({
  type: z.literal("matrix"),
  columns: z.number(),
  cells: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      items: z.array(itemSchema),
    }),
  ),
});

const detailSchema = z.object({
  type: z.literal("detail"),
  queryKey: z.string(),
  master: matrixSchema,
  open: z
    .object({
      forId: z.string(),
      title: z.string(),
      blocks: z.array(z.looseObject({ type: z.string() })),
    })
    .optional(),
});

async function boardDetail(
  registration: StudioWorkspaceRegistration,
  query?: Record<string, string>,
): Promise<z.output<typeof detailSchema>> {
  const { view } = z
    .object({ view: z.object({ blocks: z.array(z.unknown()) }) })
    .parse(await registration.dataProvider(niels, query));
  const detail = view.blocks
    .map((block) => detailSchema.safeParse(block))
    .find((parsed) => parsed.success);
  if (!detail?.success) throw new Error("Board has no card detail");
  return detail.data;
}

async function board(
  registration: StudioWorkspaceRegistration,
): Promise<z.output<typeof matrixSchema>> {
  return (await boardDetail(registration)).master;
}

function column(
  matrix: z.output<typeof matrixSchema>,
  status: string,
): z.output<typeof itemSchema>[] {
  return matrix.cells.find((cell) => cell.id === status)?.items ?? [];
}

describe("the Board workspace", () => {
  it("is the team's Trusted Board", async () => {
    const registration = await registered(await brain([]));
    expect(registration.id).toBe("action-board:board");
    expect(registration.label).toBe("Board");
    expect(registration.permission).toBe("trusted");
  });

  it("lays cards out in To do, Doing, Blocked and Done, leaving dropped items off", async () => {
    const registration = await registered(
      await brain([
        { id: "a", text: "Draft the checklist", status: "open" },
        { id: "b", text: "Write the invitation", status: "doing" },
        { id: "c", text: "Book the venue", status: "blocked" },
        { id: "d", text: "Pick a date", status: "done" },
        { id: "e", text: "Rent a boat", status: "dropped" },
      ]),
    );

    const matrix = await board(registration);

    expect(matrix.columns).toBe(4);
    expect(matrix.cells.map((cell) => [cell.id, cell.label])).toEqual([
      ["open", "To do"],
      ["doing", "Doing"],
      ["blocked", "Blocked"],
      ["done", "Done"],
    ]);
    expect(column(matrix, "open").map((card) => card.title)).toEqual([
      "Draft the checklist",
    ]);
    expect(column(matrix, "blocked").map((card) => card.title)).toEqual([
      "Book the venue",
    ]);
    expect(JSON.stringify(matrix)).not.toContain("Rent a boat");
  });

  it("shows the 20 most recently finished cards", async () => {
    const registration = await registered(
      await brain(
        Array.from({ length: 21 }, (_, index) => ({
          id: `done-${index}`,
          text: `Finished task ${index}`,
          status: "done" as const,
        })),
      ),
    );

    expect(column(await board(registration), "done")).toHaveLength(20);
  });
  it("offers each card the moves its column allows", async () => {
    const registration = await registered(
      await brain([
        { id: "a", text: "Draft the checklist", status: "open" },
        { id: "c", text: "Book the venue", status: "blocked" },
      ]),
    );
    const matrix = await board(registration);

    const labels = (status: string): (string | undefined)[] =>
      (column(matrix, status)[0]?.actions ?? []).map((action) => action.label);
    expect(labels("open")).toEqual(["Start", "Block", "Done", "Drop"]);
    expect(column(matrix, "open")[0]?.actionsLabel).toBe("Move");
    expect(labels("blocked")).toEqual(["Resume", "Done", "Drop"]);
  });

  it("moves a card when it is dropped on another column; dropping it off the board stays in the menu", async () => {
    const registration = await registered(
      await brain([{ id: "a", text: "Draft the checklist", status: "open" }]),
    );
    const matrix = await board(registration);

    expect(
      (column(matrix, "open")[0]?.actions ?? []).map((action) => [
        action.label,
        action.dropTarget,
      ]),
    ).toEqual([
      ["Start", "doing"],
      ["Block", "blocked"],
      ["Done", "done"],
      ["Drop", undefined],
    ]);
  });

  it("shows who is on a blocked card and where it came from", async () => {
    const registration = await registered(
      await brain([
        {
          id: "c",
          text: "Book the venue",
          status: "blocked",
          assignee: "Sam Rivera",
        },
      ]),
    );
    const [card] = column(await board(registration), "blocked");
    expect(card?.metadata).toContain("Sam Rivera");
    expect(card?.metadata).toContain("#events");
  });
  it("opens a card in place and links it to its editor and source summary", async () => {
    const registration = await registered(
      await brain([{ id: "a", text: "Draft the checklist", status: "open" }]),
    );
    const [card] = column(await board(registration), "open");
    expect(JSON.stringify(card)).toContain(
      '"link":{"kind":"detail","itemId":"a"}',
    );
    const links = JSON.stringify(card?.links);
    expect(links).toContain('"entityType":"summary"');
    expect(links).toContain('"id":"conv-1"');
    expect(links).toContain('"entityType":"action-item"');
  });

  it("shows an open card's text, facts, notes and a note form", async () => {
    const registration = await registered(
      await brain([
        {
          id: "c",
          text: "Book the venue",
          status: "blocked",
          assignee: "Sam Rivera",
        },
      ]),
    );

    const detail = await boardDetail(registration, { card: "c" });

    expect(detail.queryKey).toBe("card");
    expect(detail.open?.forId).toBe("c");
    expect(detail.open?.title).toBe("Book the venue");
    const open = JSON.stringify(detail.open?.blocks);
    expect(open).toContain('"id":"card-text","text":"Book the venue"');
    expect(open).not.toContain("# Action item");
    expect(open).toContain('"label":"Assigned to"');
    expect(open).not.toContain("History");
    expect(open).toContain("Sam Rivera");
    expect(open).toContain('"label":"Add a note"');
    expect(open).toContain('"control":"text"');
  });

  it("offers to track an Inbox item that a follow-up links to", async () => {
    const registration = await registered(await brain([]));
    const view = JSON.stringify(
      await registration.dataProvider(niels, {
        trackSource: "contact-requests",
        trackType: "contact-request",
        trackId: "req-1",
        trackTitle: "Could we share your field notes?",
        trackSummary: "Grace asks whether we would share our field notes.",
      }),
    );

    expect(view).toContain('"label":"Track as action item"');
    expect(view).toContain('"actionId":"track"');
    expect(view).toContain('"title":"Could we share your field notes?"');
    expect(view).toContain('"entityId":"req-1"');
    expect(view).toContain('"label":"Assign to"');
  });

  it("tracks an Inbox item as a card that links back to it", async () => {
    const registration = await registered(await brain([]));
    if (!registration.actionHandler) throw new Error("Board has no actions");

    expect(
      await registration.actionHandler(
        {
          actionId: "track",
          input: {
            sourceId: "contact-requests",
            entityType: "contact-request",
            entityId: "req-1",
            title: "Reply about the field notes",
            text: "Grace asks whether we would share our field notes.",
            assignee: "Alex Morgan",
          },
        },
        niels,
      ),
    ).toEqual({ status: "Tracked on the board." });

    // The follow-up link still names the item: the board says it is tracked.
    const after = JSON.stringify(
      await registration.dataProvider(niels, {
        trackSource: "contact-requests",
        trackType: "contact-request",
        trackId: "req-1",
        trackTitle: "Could we share your field notes?",
      }),
    );
    expect(after).toContain("This Inbox item is on the board.");
    expect(after).not.toContain('"actionId":"track"');

    const [card] = column(await board(registration), "open");
    expect(card?.title).toBe("Reply about the field notes");
    expect(card?.metadata).toContain("Inbox");
    expect(card?.metadata).toContain("Alex Morgan");
    const links = JSON.stringify(card?.links);
    expect(links).toContain('"label":"Inbox source"');
    expect(links).toContain('"entityType":"contact-request"');
  });

  it("offers a New card form on the board", async () => {
    const registration = await registered(await brain([]));
    const view = JSON.stringify(await registration.dataProvider(niels, {}));

    expect(view).toContain('"actionId":"create"');
    expect(view).toContain('"label":"New card"');
    expect(view).toContain('"presentation":"disclosure"');
  });

  it("adds a card from the board to To do", async () => {
    const registration = await registered(await brain([]));
    if (!registration.actionHandler) throw new Error("Board has no actions");

    expect(
      await registration.actionHandler(
        {
          actionId: "create",
          input: {
            title: "Order name badges",
            text: "Two hundred, with the new logo.",
            assignee: "Alex Morgan",
          },
        },
        niels,
      ),
    ).toEqual({ status: "Added to To do." });

    const [card] = column(await board(registration), "open");
    expect(card?.title).toBe("Order name badges");
    expect(card?.metadata).toContain("Board");
    expect(card?.metadata).toContain("Alex Morgan");
    const links = JSON.stringify(card?.links);
    expect(links).toContain('"label":"Open in editor"');
    expect(links).not.toContain("Inbox source");
    expect(links).not.toContain("Conversation summary");
  });

  it("adds a note under the signed-in name", async () => {
    const context = await brain([
      { id: "a", text: "Draft the checklist", status: "open" },
    ]);
    const registration = await registered(context);
    if (!registration.actionHandler) throw new Error("Board has no actions");

    expect(
      await registration.actionHandler(
        { actionId: "note", input: { id: "a", text: "Started a draft." } },
        niels,
      ),
    ).toEqual({ status: "Note added." });

    const stored = await context.entityService.getEntity(
      { entityType: "action-item", id: "a", visibilityScope: "restricted" },
      actionItemSchema,
    );
    expect(stored?.content).toContain("— Started a draft.");
    expect(stored?.content).toContain("Niels Ward");
    const detail = await boardDetail(registration, { card: "a" });
    expect(JSON.stringify(detail.open?.blocks)).toContain("Started a draft.");
  });

  it("moves a card and records who moved it", async () => {
    const context = await brain([
      { id: "a", text: "Draft the checklist", status: "open" },
    ]);
    const registration = await registered(context);
    if (!registration.actionHandler) throw new Error("Board has no actions");

    const outcome = await registration.actionHandler(
      { actionId: "move", input: { id: "a", from: "open", to: "blocked" } },
      niels,
    );

    expect(outcome).toEqual({ status: "Moved to Blocked." });

    const stored = await context.entityService.getEntity(
      { entityType: "action-item", id: "a", visibilityScope: "restricted" },
      actionItemSchema,
    );
    expect(stored?.metadata.status).toBe("blocked");
  });

  it("drops a card off the board", async () => {
    const context = await brain([
      { id: "a", text: "Draft the checklist", status: "open" },
    ]);
    const registration = await registered(context);
    if (!registration.actionHandler) throw new Error("Board has no actions");

    await registration.actionHandler(
      { actionId: "drop", input: { id: "a", from: "open" } },
      niels,
    );

    expect(
      JSON.stringify(await registration.dataProvider(niels)),
    ).not.toContain("Draft the checklist");
  });

  it("reports a move from a column the card has already left", async () => {
    const registration = await registered(
      await brain([{ id: "a", text: "Write the invitation", status: "done" }]),
    );
    if (!registration.actionHandler) throw new Error("Board has no actions");

    // Reported in the action result, not as an error the host would redact.
    expect(
      await registration.actionHandler(
        { actionId: "move", input: { id: "a", from: "doing", to: "blocked" } },
        niels,
      ),
    ).toEqual({
      status: "This card is now Done; your move was not applied.",
    });
  });
});
