import {
  defineEntityCatalog,
  defineStudioWorkspace,
  defineWorkspaceAction,
  permissionToVisibilityScope,
  registerBuiltInStudioWorkspace,
  type EntityPluginContext,
  type OperatorCaller,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { ACTION_ITEM_ENTITY_TYPE, SUMMARY_ENTITY_TYPE } from "./constants";
import { moveActionItem } from "./action-item-moves";
import { actionItemTitle, arrivedAt, lastArrival } from "./action-item-board";
import { channelLabel, formatAge } from "./widgets/format";
import {
  actionItemSchema,
  actionItemStatusSchema,
  type ActionItemEntity,
  type ActionItemStatus,
} from "../schemas/conversation-memory";

const COLUMNS = [
  { status: "open", label: "To do", empty: "Nothing waiting to start." },
  { status: "doing", label: "Doing", empty: "Nobody is on anything yet." },
  { status: "blocked", label: "Blocked", empty: "Nothing is blocked." },
  {
    status: "done",
    label: "Done",
    empty: "Nothing finished in the last 14 days.",
  },
] as const satisfies readonly {
  status: ActionItemStatus;
  label: string;
  empty: string;
}[];

/** A matrix cell holds at most 100 items. */
const COLUMN_LIMIT = 100;
const DONE_WINDOW_DAYS = 14;
/** Catalog links accept entity ids up to this length. */
const LINKABLE_ID_LENGTH = 120;

/** The moves each column offers, in the order the card shows them. */
const MOVES: Record<
  ActionItemStatus,
  readonly { to: ActionItemStatus; label: string }[]
> = {
  open: [
    { to: "doing", label: "Start" },
    { to: "blocked", label: "Block" },
    { to: "done", label: "Done" },
  ],
  doing: [
    { to: "blocked", label: "Block" },
    { to: "done", label: "Done" },
    { to: "open", label: "To do" },
  ],
  blocked: [
    { to: "doing", label: "Resume" },
    { to: "done", label: "Done" },
  ],
  done: [{ to: "open", label: "Reopen" }],
  dropped: [],
};

const STATUS_LABELS: Record<ActionItemStatus, string> = {
  open: "To do",
  doing: "Doing",
  blocked: "Blocked",
  done: "Done",
  dropped: "Dropped",
};

const cardSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: actionItemStatusSchema,
  assignees: z.array(z.string()),
  age: z.string(),
  channel: z.string(),
  summaryId: z.string(),
  blockedFor: z.string().optional(),
  blockedBy: z.string().optional(),
});

const dataSchema = z.object({ cards: z.array(cardSchema) });

type BoardCard = z.output<typeof cardSchema>;

const boardSources = defineEntityCatalog({
  id: "board-sources",
  label: "Action items and their sources",
});

/** How a move went, in a sentence the board shows the mover. */
const moveResultSchema = z.object({ status: z.string() });

const moveResult = {
  title: "Move",
  fields: { status: { label: "Outcome" } },
} as const;

const moveAction = defineWorkspaceAction({
  name: "move",
  label: "Move",
  input: z.object({
    id: z.string(),
    from: actionItemStatusSchema,
    to: actionItemStatusSchema,
  }),
  output: moveResultSchema,
});

const dropAction = defineWorkspaceAction({
  name: "drop",
  label: "Drop",
  confirmation: {
    kind: "static",
    message:
      "Drop this action item? It leaves the board; the Library keeps it.",
  },
  input: z.object({ id: z.string(), from: actionItemStatusSchema }),
  output: moveResultSchema,
});

const boardWorkspace = defineStudioWorkspace({
  id: "board",
  label: "Board",
  description: "The team's action items, by where they stand.",
  priority: 15,
  permission: "trusted",
  entityCatalog: boardSources,
  data: dataSchema,
  actions: [moveAction, dropAction],
  view: ({ data }) => ({
    title: "Board",
    description: "Action items from the team's conversations.",
    blocks: [
      {
        type: "matrix",
        id: "board",
        columns: 4,
        cells: COLUMNS.map((column) => ({
          id: column.status,
          label: column.label,
          ...(column.status === "blocked" ? { tone: "warn" as const } : {}),
          empty: column.empty,
          items: data.cards
            .filter((card) => card.status === column.status)
            .map(cardItem),
        })),
      },
      {
        type: "text",
        id: "board-done-window",
        text: `Done shows the last ${DONE_WINDOW_DAYS} days; older action items stay in the Library.`,
      },
    ],
  }),
});

function cardItem(card: BoardCard): {
  id: string;
  title: string;
  metadata: string[];
  badges?: { label: string; tone: "warn" }[];
  link?: { catalog: typeof boardSources; entityType: string; id: string };
  actionsLabel: string;
  links?: {
    label: string;
    target: { catalog: typeof boardSources; entityType: string; id: string };
  }[];
  actions: (
    | {
        action: typeof moveAction;
        label: string;
        input: { id: string; from: ActionItemStatus; to: ActionItemStatus };
        result: typeof moveResult;
      }
    | {
        action: typeof dropAction;
        label: string;
        input: { id: string; from: ActionItemStatus };
        result: typeof moveResult;
      }
  )[];
} {
  return {
    id: card.id,
    title: card.title,
    metadata: [...card.assignees, card.age, card.channel].filter(
      (segment) => segment.length > 0,
    ),
    ...(card.blockedFor
      ? {
          badges: [
            {
              label: card.blockedBy
                ? `Blocked by ${card.blockedBy} ${card.blockedFor}`
                : `Blocked ${card.blockedFor}`,
              tone: "warn",
            },
          ],
        }
      : {}),
    ...(card.id.length <= LINKABLE_ID_LENGTH
      ? {
          link: {
            catalog: boardSources,
            entityType: ACTION_ITEM_ENTITY_TYPE,
            id: card.id,
          },
        }
      : {}),
    ...(card.summaryId.length <= LINKABLE_ID_LENGTH
      ? {
          links: [
            {
              label: "Conversation summary",
              target: {
                catalog: boardSources,
                entityType: SUMMARY_ENTITY_TYPE,
                id: card.summaryId,
              },
            },
          ],
        }
      : {}),
    actionsLabel: "Move",
    actions: [
      ...MOVES[card.status].map((move) => ({
        action: moveAction,
        label: move.label,
        input: { id: card.id, from: card.status, to: move.to },
        result: moveResult,
      })),
      {
        action: dropAction,
        label: "Drop",
        input: { id: card.id, from: card.status },
        result: moveResult,
      },
    ],
  };
}

function toCard(entity: ActionItemEntity, now: Date): BoardCard {
  const blocked =
    entity.metadata.status === "blocked"
      ? lastArrival(entity, "blocked")
      : undefined;
  return {
    id: entity.id,
    title: actionItemTitle(entity),
    status: entity.metadata.status,
    assignees: (entity.metadata.assignedTo ?? []).map(
      (assignee) => assignee.displayName,
    ),
    age: formatAge(entity.metadata.timeRange.end, now),
    channel: channelLabel(
      entity.metadata.channelName,
      entity.metadata.channelId,
    ),
    summaryId: entity.metadata.sourceSummaryId,
    ...(blocked ? { blockedFor: formatAge(blocked.at, now) } : {}),
    ...(blocked?.displayName ? { blockedBy: blocked.displayName } : {}),
  };
}

/**
 * When a card was finished. Items finished before moves were recorded fall
 * back to when they were captured: `updated` moves with every import.
 */
function finishedAt(entity: ActionItemEntity): number {
  return new Date(
    arrivedAt(entity, "done") ?? entity.metadata.timeRange.end,
  ).getTime();
}

function finishedRecently(entity: ActionItemEntity, now: Date): boolean {
  return now.getTime() - finishedAt(entity) <= DONE_WINDOW_DAYS * 86_400_000;
}

export interface BoardWorkspaceDeps {
  now?: () => Date;
}

/** Registers the Board workspace; a no-op where Studio does not run. */
export async function registerBoardWorkspace(
  context: EntityPluginContext,
  deps: BoardWorkspaceDeps = {},
): Promise<string | undefined> {
  const now = (): Date => deps.now?.() ?? new Date();

  const move = async (
    caller: OperatorCaller | null,
    request: { id: string; from: ActionItemStatus; to: ActionItemStatus },
  ): Promise<{ status: string }> => {
    if (!caller) throw new Error("Moving a card requires a signed-in member");
    const result = await moveActionItem(
      {
        entityService: context.entityService,
        visibilityScope: permissionToVisibilityScope(caller.permission),
        now,
      },
      {
        ...request,
        actor: { kind: "user", userId: caller.actor.id },
        actorName: caller.actor.displayName,
      },
    );
    // Outcomes travel as the action result: the host redacts thrown errors.
    switch (result.status) {
      case "moved":
        return { status: `Moved to ${STATUS_LABELS[request.to]}.` };
      case "not-found":
        return { status: "This card is no longer on the board." };
      case "conflict":
        return {
          status: `This card is now ${STATUS_LABELS[result.current]}; your move was not applied.`,
        };
    }
  };

  const result = await registerBuiltInStudioWorkspace({
    context,
    definition: boardWorkspace,
    bind: (bindingContext) =>
      boardWorkspace.bind(bindingContext, {
        listEntityTypes: () => [ACTION_ITEM_ENTITY_TYPE, SUMMARY_ENTITY_TYPE],
        load: async ({ caller }) => {
          if (!caller) throw new Error("The board requires a signed-in member");
          const visibilityScope = permissionToVisibilityScope(
            caller.permission,
          );
          const at = now();
          const columns = await Promise.all(
            COLUMNS.map(({ status }) =>
              context.entityService.listEntities(
                {
                  entityType: ACTION_ITEM_ENTITY_TYPE,
                  options: {
                    filter: { metadata: { status }, visibilityScope },
                    sortFields: [{ field: "updated", direction: "desc" }],
                    limit: COLUMN_LIMIT,
                  },
                },
                actionItemSchema,
              ),
            ),
          );
          const [open = [], doing = [], blocked = [], done = []] = columns;
          const finished = done
            .filter((entity) => finishedRecently(entity, at))
            .sort((a, b) => finishedAt(b) - finishedAt(a));
          return {
            cards: [...open, ...doing, ...blocked, ...finished].map((entity) =>
              toCard(entity, at),
            ),
          };
        },
        actions: [
          moveAction.bind(bindingContext, ({ caller, input }) =>
            move(caller, input),
          ),
          dropAction.bind(bindingContext, ({ caller, input }) =>
            move(caller, { ...input, to: "dropped" }),
          ),
        ],
      }),
  });
  return result === false ? undefined : result.workspaceUrl;
}
export const BOARD_WORKSPACE_ID = "conversation-memory:board";
