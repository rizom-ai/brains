import { describe, expect, it } from "bun:test";
import {
  createEntityPluginContext,
  createMockShell,
  type EntityPluginContext,
} from "@brains/plugins/test";
import type {
  StudioWorkspaceActor,
  StudioWorkspaceRegistration,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { ActionItemAdapter } from "../../src/adapters/conversation-memory-adapters";
import { registerBoardWorkspace } from "../../src/lib/board-workspace";
import {
  actionItemSchema,
  type ActionItemHistoryEntry,
  type ActionItemMetadata,
  type ActionItemStatus,
} from "../../src/schemas/conversation-memory";

const NOW = new Date("2026-10-15T12:00:00.000Z");
const adapter = new ActionItemAdapter();

const niels: StudioWorkspaceActor = {
  interfaceType: "studio",
  userId: "u-niels",
  actor: { kind: "user", userId: "u-niels" },
  userPermissionLevel: "trusted",
  visibilityScope: "shared",
  isAnchor: false,
};

interface Card {
  id: string;
  text: string;
  status: ActionItemStatus;
  history?: ActionItemHistoryEntry[];
  updated?: string;
  assignee?: string;
}

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

async function brain(cards: Card[]): Promise<EntityPluginContext> {
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
      timeRange: { start: daysAgo(6), end: daysAgo(5) },
      sourceSummaryId: "conv-1",
      sourceMessageCount: 3,
      projectionVersion: 1,
      status: card.status,
      ...(card.assignee
        ? { assignedTo: [{ displayName: card.assignee }] }
        : {}),
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
        ...(card.updated
          ? { created: card.updated, updated: card.updated }
          : {}),
      },
    });
  }
  return context;
}

async function registered(
  context: EntityPluginContext,
): Promise<StudioWorkspaceRegistration> {
  let registration: StudioWorkspaceRegistration | undefined;
  context.messaging.subscribe<
    StudioWorkspaceRegistration,
    { workspaceUrl: string }
  >("studio:register-workspace", async (message) => {
    registration = message.payload;
    return {
      success: true,
      data: { workspaceUrl: "/studio/workspaces/conversation-memory%3Aboard" },
    };
  });
  await registerBoardWorkspace(context, { now: () => NOW });
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
  actions: z
    .array(z.object({ label: z.string().optional(), input: z.unknown() }))
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

async function board(
  registration: StudioWorkspaceRegistration,
): Promise<z.output<typeof matrixSchema>> {
  const { view } = z
    .object({ view: z.object({ blocks: z.array(z.unknown()) }) })
    .parse(await registration.dataProvider(niels));
  const matrix = view.blocks
    .map((block) => matrixSchema.safeParse(block))
    .find((parsed) => parsed.success);
  if (!matrix?.success) throw new Error("Board has no matrix");
  return matrix.data;
}

function column(
  matrix: z.output<typeof matrixSchema>,
  status: string,
): z.output<typeof itemSchema>[] {
  return matrix.cells.find((cell) => cell.id === status)?.items ?? [];
}

const move = (
  at: string,
  from: ActionItemStatus,
  to: ActionItemStatus,
): ActionItemHistoryEntry => ({
  at,
  actor: { kind: "user", userId: "u-sam" },
  from,
  to,
});

describe("the Board workspace", () => {
  it("is the team's Trusted Board", async () => {
    const registration = await registered(await brain([]));
    expect(registration.id).toBe("conversation-memory:board");
    expect(registration.label).toBe("Board");
    expect(registration.permission).toBe("trusted");
  });

  it("lays cards out in To do, Doing, Blocked and Done, leaving dropped items off", async () => {
    const registration = await registered(
      await brain([
        { id: "a", text: "Draft the checklist", status: "open" },
        { id: "b", text: "Write the invitation", status: "doing" },
        { id: "c", text: "Book the venue", status: "blocked" },
        {
          id: "d",
          text: "Pick a date",
          status: "done",
          history: [move(daysAgo(2), "open", "done")],
        },
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

  it("shows only cards finished in the last 14 days", async () => {
    const registration = await registered(
      await brain([
        {
          id: "recent",
          text: "Share the call summary",
          status: "done",
          history: [move(daysAgo(3), "doing", "done")],
        },
        {
          id: "old",
          text: "Pick last year's date",
          status: "done",
          history: [move(daysAgo(20), "doing", "done")],
        },
        {
          id: "old-unrecorded",
          text: "Close the old survey",
          status: "done",
          updated: daysAgo(30),
        },
      ]),
    );

    expect(
      column(await board(registration), "done").map((card) => card.title),
    ).toEqual(["Share the call summary"]);
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
    expect(labels("blocked")).toEqual(["Resume", "Done", "Drop"]);
  });

  it("marks how long a blocked card has waited", async () => {
    const registration = await registered(
      await brain([
        {
          id: "c",
          text: "Book the venue",
          status: "blocked",
          assignee: "Sam Rivera",
          history: [move(daysAgo(2), "open", "blocked")],
        },
      ]),
    );
    const [card] = column(await board(registration), "blocked");
    expect(card?.badges?.map((badge) => badge.label)).toEqual(["Blocked 2d"]);
    expect(card?.metadata).toContain("Sam Rivera");
    expect(card?.metadata).toContain("#events");
  });

  it("links each card to the action item and its source summary", async () => {
    const registration = await registered(
      await brain([{ id: "a", text: "Draft the checklist", status: "open" }]),
    );
    const [card] = column(await board(registration), "open");
    const links = JSON.stringify(card?.links);
    expect(links).toContain('"entityType":"summary"');
    expect(links).toContain('"id":"conv-1"');
    expect(JSON.stringify(card)).toContain('"entityType":"action-item"');
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
    expect(stored?.metadata.history?.[0]).toMatchObject({
      actor: { kind: "user", userId: "u-niels" },
      from: "open",
      to: "blocked",
    });
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
      await brain([
        {
          id: "a",
          text: "Write the invitation",
          status: "done",
          history: [move(daysAgo(0), "doing", "done")],
        },
      ]),
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
