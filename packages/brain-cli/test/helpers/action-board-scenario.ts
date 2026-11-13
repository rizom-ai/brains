import type {
  Plugin,
  PluginCapabilities,
  StudioWorkspaceActor,
  StudioWorkspaceRegistration,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { DeclaredEntityStore } from "./declared-entity-store";

/**
 * The action board driven through what it registers, on a store holding
 * main's action items: its chat tools, its Board in Studio, its Inbox source
 * and its track follow-up. What each answered and what each wrote, with the
 * clock held still, so a class and a definition answer alike.
 */

export interface ActionBoardScenario {
  answers: Record<string, unknown>;
  rows: Record<string, { content: string; metadata: unknown } | null>;
}

const niels: StudioWorkspaceActor = {
  interfaceType: "studio",
  userId: "u-niels",
  displayName: "Niels Ward",
  actor: { kind: "user", userId: "u-niels" },
  userPermissionLevel: "trusted",
  visibilityScope: "shared",
  isAnchor: false,
};

/** The admin, who sees the restricted cards the board adds. */
const anchor: StudioWorkspaceActor = {
  ...niels,
  userId: "u-ada",
  displayName: "Ada Lovelace",
  actor: { kind: "user", userId: "u-ada" },
  userPermissionLevel: "admin",
  visibilityScope: "restricted",
  isAnchor: true,
};

const inChat = {
  interfaceType: "discord",
  actor: { kind: "user" as const, userId: "u-niels" },
  displayName: "Niels Ward",
  userPermissionLevel: "trusted" as const,
  conversationId: "discord:1",
  channelId: "1",
  channelName: "executive-room",
};

const toolSchema = z.object({
  name: z.string(),
  handler: z.custom<(input: unknown, context: unknown) => Promise<unknown>>(
    (value) => typeof value === "function",
  ),
});

/** The cards the store holds before the scenario runs. */
const SEEDED = new Set([
  "book-the-venue",
  "conv-2:action-item:1:ef3456",
  "board:roof",
  "fix-the-gutter",
]);

/** Every action item stored, by id. */
async function storedIds(opened: DeclaredEntityStore): Promise<string[]> {
  const listed = await opened.service.listEntities({
    entityType: "action-item",
    options: { filter: { visibilityScope: "restricted" }, limit: 100 },
  });
  return listed.map(({ id }) => id).sort();
}

/**
 * A card added on the board or from chat takes a random suffix; each one
 * reads under a stable name, so two runs compare.
 */
function withStableIds<T>(value: T, ids: readonly string[]): T {
  const named = ids
    .filter((id) => !SEEDED.has(id))
    .map((id) => [id, id.replace(/-[0-9a-z]+$/u, "-<new>")] as const)
    .filter(([id, stable]) => id !== stable);
  const text = named.reduce(
    (current, [id, stable]) => current.replaceAll(id, stable),
    JSON.stringify(value),
  );
  return JSON.parse(text);
}

export async function runActionBoardScenario(
  opened: DeclaredEntityStore,
  plugins: Plugin[],
): Promise<ActionBoardScenario> {
  const { shell } = opened;
  let registration: StudioWorkspaceRegistration | undefined;
  const bus = shell.getMessageBus();
  bus.subscribe<StudioWorkspaceRegistration, { workspaceUrl: string }>(
    "studio:register-workspace",
    async ({ payload }) => {
      registration = payload;
      return {
        success: true,
        data: { workspaceUrl: "/studio/workspaces/action-board%3Aboard" },
      };
    },
  );
  const capabilities: PluginCapabilities[] = [];
  for (const plugin of plugins) capabilities.push(await plugin.register(shell));
  shell.getInboxRegistry().finalize();
  shell.getInboxFollowUpRegistry().finalize();
  for (const plugin of plugins) await plugin.ready?.();
  if (!registration?.actionHandler) throw new Error("No Board");
  const board = registration;
  const act = registration.actionHandler;
  const tools = new Map(
    capabilities
      .flatMap(({ tools: list }) => list)
      .map((tool) => toolSchema.parse(tool))
      .map((tool) => [tool.name, tool.handler]),
  );
  const tool = (name: string): ((input: unknown) => Promise<unknown>) => {
    const handler = tools.get(name);
    if (!handler) throw new Error(`No tool ${name}`);
    return (input) => handler(input, inChat);
  };
  const answers: Record<string, unknown> = {};
  const inbox = shell.getInboxRegistry().getSource("action-items");
  if (!inbox) throw new Error("No Inbox source");
  const admin = { permissionLevel: "admin" as const };

  answers["boardBefore"] = await board.dataProvider(niels, {});
  answers["inboxBefore"] = await inbox.list();
  answers["createFromChat"] = await tool("action_item_create")({
    title: "Print the posters",
    details: "A3, two hundred.",
    assignee: "nobody",
    due: "2026-04-17",
  });
  answers["createStranger"] = await tool("action_item_create")({
    title: "Call Grace",
    assignee: "Grace",
    due: "none",
  });
  answers["updateFromChat"] = await tool("action_item_update")({
    id: "Book the venue",
    status: "doing",
    note: "Called them, waiting for a quote.",
  });
  answers["createOnBoard"] = await act(
    {
      actionId: "create",
      input: { title: "Order name badges", text: "With the new logo." },
    },
    niels,
  );
  answers["moveOnBoard"] = await act(
    {
      actionId: "move",
      input: { id: "board:roof", from: "doing", to: "blocked" },
    },
    niels,
  );
  answers["staleMove"] = await act(
    {
      actionId: "move",
      input: { id: "board:roof", from: "doing", to: "done" },
    },
    niels,
  );
  const badges = (await storedIds(opened)).find((id) =>
    id.startsWith("order-name-badges-"),
  );
  answers["noteOnBoard"] = await act(
    {
      actionId: "note",
      input: { id: badges ?? "", text: "Ordered from the printer." },
    },
    niels,
  );
  answers["noteAsAdmin"] = await act(
    {
      actionId: "note",
      input: { id: badges ?? "", text: "Ordered from the printer." },
    },
    anchor,
  );
  answers["dropOnBoard"] = await act(
    {
      actionId: "drop",
      input: { id: "conv-2:action-item:1:ef3456", from: "open" },
    },
    niels,
  );
  answers["trackOnBoard"] = await act(
    {
      actionId: "track",
      input: {
        sourceId: "contact-requests",
        entityType: "contact-request",
        entityId: "req-1",
        title: "Reply about the field notes",
        text: "Grace asks about our field notes.",
      },
    },
    niels,
  );
  answers["trackAgain"] = await act(
    {
      actionId: "track",
      input: {
        sourceId: "contact-requests",
        entityType: "contact-request",
        entityId: "req-1",
        title: "Reply about the field notes",
        text: "Grace asks about our field notes.",
      },
    },
    niels,
  );
  answers["followUp"] = await shell
    .getInboxFollowUpRegistry()
    .resolveUniversal({
      sourceId: "contact-requests",
      item: {
        id: "req-2",
        title: "Could we share your field notes?",
        summary: "Grace asks about our field notes.",
        receivedAt: "2026-04-09T10:00:00.000Z",
        urgency: "normal",
        entityRef: { entityType: "contact-request", entityId: "req-2" },
        actions: [],
      },
      actor: { permissionLevel: "trusted" },
    });
  answers["inboxBlocked"] = await inbox.list();
  answers["inboxDetail"] = await inbox.resolveDetail?.(
    "board:roof",
    admin,
    new AbortController().signal,
  );
  await inbox.act("fix-the-gutter", "done", admin);
  answers["boardAfter"] = await board.dataProvider(niels, {});
  answers["boardAdmin"] = await board.dataProvider(anchor, {});
  answers["boardOpen"] = await board.dataProvider(anchor, {
    card: badges ?? "",
  });
  answers["boardTrack"] = await board.dataProvider(niels, {
    trackSource: "contact-requests",
    trackType: "contact-request",
    trackId: "req-2",
    trackTitle: "Could we share your field notes?",
  });
  const ids = await storedIds(opened);
  const rows: ActionBoardScenario["rows"] = {};
  for (const id of ids) {
    const stored = await opened.stored("action-item", id);
    rows[id] = stored
      ? { content: stored.content, metadata: JSON.parse(stored.metadata) }
      : null;
  }
  for (const plugin of plugins) await plugin.shutdown?.();
  return withStableIds({ answers, rows }, ids);
}
