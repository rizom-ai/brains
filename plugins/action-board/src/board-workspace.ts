import {
  defineEntityCatalog,
  defineStudioWorkspace,
  defineWorkspaceAction,
  permissionToVisibilityScope,
  registerBuiltInStudioWorkspace,
  type ContentVisibility,
  type ServicePluginContext,
  type OperatorCaller,
  type OperatorRegionBlock,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { ACTION_ITEM_ENTITY_TYPE } from "@brains/action-items";
import {
  addActionItemNote,
  inboxCardId,
  moveActionItem,
  trackInboxItem,
  createBoardCard,
} from "@brains/action-items";
import {
  actionItemBody,
  actionItemCapturedAt,
  actionItemSource,
  actionItemTitle,
} from "@brains/action-items";
import { formatAge } from "@brains/action-items";
import {
  actionItemSchema,
  actionItemStatusSchema,
  type ActionItemEntity,
  type ActionItemStatus,
} from "@brains/action-items";
import {
  definedProjectGrouping,
  projectMembers,
  projectOptions,
} from "./projects";

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
/** Done shows only the most recently finished cards. */
const DONE_LIMIT = 20;
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
  place: z.string(),
  /** The entity the card came from; a card added on the board has none. */
  source: z
    .object({
      label: z.string(),
      entityType: z.string(),
      id: z.string(),
    })
    .optional(),
});

const openCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  status: actionItemStatusSchema,
  assignees: z.array(z.string()),
  requesters: z.array(z.string()),
  channel: z.string(),
  notes: z.string().optional(),
});

/** An Inbox item a follow-up asked to track, carried in the URL. */
const trackSchema = z.object({
  sourceId: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  title: z.string(),
  summary: z.string(),
  /** The item already has its card. */
  tracked: z.boolean(),
});

/** The project the board is filtered to, rolled up. */
const rollupSchema = z.object({
  name: z.string(),
  counts: z.array(
    z.object({
      status: actionItemStatusSchema,
      label: z.string(),
      count: z.number(),
    }),
  ),
  blocked: z.array(z.object({ id: z.string(), title: z.string() })),
});

const projectsSchema = z.object({
  options: z.array(
    z.object({ value: z.string(), label: z.string(), count: z.number() }),
  ),
  selected: rollupSchema.optional(),
});

const dataSchema = z.object({
  cards: z.array(cardSchema),
  open: openCardSchema.optional(),
  track: trackSchema.optional(),
  /** Present when the brain defines a project grouping over action items. */
  projects: projectsSchema.optional(),
});

/** The open card lives in the URL, so a reload reopens it. */
const boardQuerySchema = z.object({
  card: z.string().optional(),
  project: z.string().optional(),
  trackSource: z.string().optional(),
  trackType: z.string().optional(),
  trackId: z.string().optional(),
  trackTitle: z.string().optional(),
  trackSummary: z.string().optional(),
});

type OpenCard = z.output<typeof openCardSchema>;

type Projects = z.output<typeof projectsSchema>;

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

const noteAction = defineWorkspaceAction({
  name: "note",
  label: "Add a note",
  input: z.object({
    id: z.string(),
    text: z.string().trim().min(1).max(2_000),
  }),
  output: moveResultSchema,
});

const noteResult = {
  title: "Note",
  fields: { status: { label: "Outcome" } },
} as const;

const trackAction = defineWorkspaceAction({
  name: "track",
  label: "Track as action item",
  input: z.object({
    sourceId: z.string().min(1),
    entityType: z.string().min(1),
    entityId: z.string().min(1),
    title: z.string().trim().min(1).max(500),
    text: z.string().max(4_000),
    assignee: z.string().max(200).optional(),
  }),
  output: moveResultSchema,
});

const createAction = defineWorkspaceAction({
  name: "create",
  label: "New card",
  input: z.object({
    title: z.string().trim().min(1).max(500),
    text: z.string().max(4_000).optional(),
    assignee: z.string().max(200).optional(),
  }),
  output: moveResultSchema,
});

const createResult = {
  title: "New card",
  fields: { status: { label: "Outcome" } },
} as const;

const trackResult = {
  title: "Track",
  fields: { status: { label: "Outcome" } },
} as const;

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

type BoardAction =
  | typeof moveAction
  | typeof dropAction
  | typeof noteAction
  | typeof trackAction
  | typeof createAction;

/** The project filter and, once a project is chosen, its roll-up. */
function projectBlocks(projects: Projects): OperatorRegionBlock<BoardAction>[] {
  const selected = projects.selected;
  return [
    {
      type: "query",
      id: "board-projects",
      controls: [
        {
          key: "project",
          label: "Project",
          allLabel: "All projects",
          ...(selected ? { value: selected.name } : {}),
          options: projects.options,
        },
      ],
    },
    ...(selected
      ? [
          {
            type: "card" as const,
            id: "project-rollup",
            label: selected.name,
            presentation: "section" as const,
            blocks: [
              {
                type: "stats" as const,
                id: "project-counts",
                items: selected.counts.map(({ status, label, count }) => ({
                  label,
                  value: count,
                  ...(status === "blocked" && count > 0
                    ? { tone: "warn" as const }
                    : {}),
                })),
              },
              {
                type: "list" as const,
                id: "project-blocked",
                presentation: "attention" as const,
                empty: "Nothing in this project is blocked.",
                items: selected.blocked.map((card) => ({
                  id: card.id,
                  title: card.title,
                })),
              },
            ],
          },
        ]
      : []),
  ];
}

/** The open card's panels: its text, facts, notes, and a note form. */
function openCardBlocks(card: OpenCard): OperatorRegionBlock<BoardAction>[] {
  return [
    { type: "text", id: "card-text", text: card.text },
    {
      type: "key-values",
      id: "card-facts",
      items: [
        { label: "Status", value: STATUS_LABELS[card.status] },
        ...(card.assignees.length > 0
          ? [{ label: "Assigned to", value: card.assignees.join(", ") }]
          : []),
        ...(card.requesters.length > 0
          ? [{ label: "Requested by", value: card.requesters.join(", ") }]
          : []),
        { label: "From", value: card.channel },
      ],
    },
    ...(card.notes
      ? [
          {
            type: "text" as const,
            id: "card-notes",
            label: "Notes",
            text: card.notes,
          },
        ]
      : []),
    {
      type: "action",
      id: "card-note",
      action: noteAction,
      label: "Add a note",
      input: { id: card.id },
      form: {
        presentation: "inline",
        submitLabel: "Add note",
        fields: { text: { label: "Note", control: "text" } },
      },
      result: noteResult,
    },
  ];
}

const boardWorkspace = defineStudioWorkspace({
  id: "board",
  label: "Board",
  description: "The team's action items, by where they stand.",
  priority: 15,
  permission: "trusted",
  entityCatalog: boardSources,
  query: boardQuerySchema,
  data: dataSchema,
  actions: [moveAction, dropAction, noteAction, trackAction, createAction],
  view: ({ data }) => ({
    title: "Board",
    description: "Action items from the team's conversations.",
    blocks: [
      ...(data.projects ? projectBlocks(data.projects) : []),
      ...(data.track
        ? [
            {
              type: "card" as const,
              id: "track",
              label: "Track as action item",
              presentation: "feature" as const,
              blocks: data.track.tracked
                ? [
                    {
                      type: "text" as const,
                      id: "track-done",
                      text: "This Inbox item is on the board.",
                    },
                  ]
                : [
                    {
                      type: "text" as const,
                      id: "track-source",
                      text: `From the Inbox: ${data.track.title}`,
                    },
                    {
                      type: "action" as const,
                      id: "track-form",
                      action: trackAction,
                      label: "Track on the board",
                      input: {
                        sourceId: data.track.sourceId,
                        entityType: data.track.entityType,
                        entityId: data.track.entityId,
                        title: data.track.title,
                        text: data.track.summary,
                      },
                      form: {
                        presentation: "inline" as const,
                        submitLabel: "Track on the board",
                        fields: {
                          title: { label: "Title", control: "text" as const },
                          text: { label: "Details", control: "text" as const },
                          assignee: {
                            label: "Assign to",
                            control: "text" as const,
                          },
                        },
                      },
                      result: trackResult,
                    },
                  ],
            },
          ]
        : []),
      {
        type: "action" as const,
        id: "new-card",
        action: createAction,
        label: "New card",
        input: {},
        form: {
          presentation: "disclosure" as const,
          submitLabel: "Add to To do",
          fields: {
            title: { label: "Title", control: "text" as const },
            text: { label: "Details", control: "text" as const },
            assignee: { label: "Assign to", control: "text" as const },
          },
        },
        result: createResult,
      },
      {
        type: "detail",
        id: "board-detail",
        queryKey: "card",
        empty: "Select a card to read it.",
        master: {
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
        ...(data.open
          ? {
              open: {
                forId: data.open.id,
                title: data.open.title,
                blocks: openCardBlocks(data.open),
              },
            }
          : {}),
      },
      {
        type: "text",
        id: "board-done-window",
        text: `Done shows the ${DONE_LIMIT} most recently finished cards; older ones stay in the Library.`,
      },
    ],
  }),
});

function cardItem(card: BoardCard): {
  id: string;
  title: string;
  metadata: string[];
  link: { detail: { itemId: string } };
  actionsLabel: string;
  links: {
    label: string;
    target: { catalog: typeof boardSources; entityType: string; id: string };
  }[];
  actions: (
    | {
        action: typeof moveAction;
        label: string;
        input: { id: string; from: ActionItemStatus; to: ActionItemStatus };
        result: typeof moveResult;
        /** Dropping the card on that column makes the same move. */
        dropTarget: ActionItemStatus;
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
    metadata: [...card.assignees, card.age, card.place].filter(
      (segment) => segment.length > 0,
    ),
    link: { detail: { itemId: card.id } },
    links: [
      ...(card.id.length <= LINKABLE_ID_LENGTH
        ? [
            {
              label: "Open in editor",
              target: {
                catalog: boardSources,
                entityType: ACTION_ITEM_ENTITY_TYPE,
                id: card.id,
              },
            },
          ]
        : []),
      ...(card.source && card.source.id.length <= LINKABLE_ID_LENGTH
        ? [
            {
              label: card.source.label,
              target: {
                catalog: boardSources,
                entityType: card.source.entityType,
                id: card.source.id,
              },
            },
          ]
        : []),
    ],
    actionsLabel: "Move",
    actions: [
      ...MOVES[card.status].map((move) => ({
        action: moveAction,
        label: move.label,
        input: { id: card.id, from: card.status, to: move.to },
        result: moveResult,
        dropTarget: move.to,
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
  const source = actionItemSource(entity);
  return {
    id: entity.id,
    title: actionItemTitle(entity),
    status: entity.metadata.status,
    assignees: (entity.metadata.assignedTo ?? []).map(
      (assignee) => assignee.name,
    ),
    age: formatAge(actionItemCapturedAt(entity), now),
    place: source.place,
    ...(source.link
      ? {
          source: {
            label: source.link.label,
            entityType: source.link.entityType,
            id: source.link.entityId,
          },
        }
      : {}),
  };
}

/** The card text and its Notes section, from the markdown body. */
function splitBody(entity: ActionItemEntity): { text: string; notes?: string } {
  const body = actionItemBody(entity.content)
    .trimStart()
    .replace(/^#\s+.+\n+/, "");
  const [text = "", notes] = body.split(/^## Notes\s*$/m);
  const trimmedNotes = notes?.trim();
  return {
    text: text.trim(),
    ...(trimmedNotes ? { notes: trimmedNotes } : {}),
  };
}

function toOpenCard(entity: ActionItemEntity): OpenCard {
  const { text, notes } = splitBody(entity);
  return {
    id: entity.id,
    title: actionItemTitle(entity),
    text: text.length > 0 ? text : actionItemTitle(entity),
    status: entity.metadata.status,
    assignees: (entity.metadata.assignedTo ?? []).map(
      (assignee) => assignee.name,
    ),
    requesters: (entity.metadata.requestedBy ?? []).flatMap((requester) =>
      requester.name ? [requester.name] : [],
    ),
    channel: actionItemSource(entity).place,
    ...(notes ? { notes } : {}),
  };
}

/** A project's members, split into the board's columns in their stored order. */
function byStatus(entities: ActionItemEntity[]): ActionItemEntity[][] {
  return COLUMNS.map(({ status }) =>
    entities.filter((entity) => entity.metadata.status === status),
  );
}

export interface BoardWorkspaceDeps {
  now?: () => Date;
  /** The grouping whose values are projects; the board offers none until the brain defines it. */
  projectGrouping?: string;
  /** The visibility the brain gives action items, for cards tracked from the Inbox. */
  visibility: ContentVisibility;
}

/** Registers the Board workspace; a no-op where Studio does not run. */
export async function registerBoardWorkspace(
  context: ServicePluginContext,
  deps: BoardWorkspaceDeps,
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
      request,
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
        // A card links to whatever its source is: a summary or an Inbox item's entity.
        listEntityTypes: () => context.entityService.getEntityTypes(),
        load: async ({ caller, query }) => {
          if (!caller) throw new Error("The board requires a signed-in member");
          const visibilityScope = permissionToVisibilityScope(
            caller.permission,
          );
          const at = now();
          const asked = query.get(boardQuerySchema);
          const grouping = deps.projectGrouping
            ? await definedProjectGrouping(context, deps.projectGrouping)
            : undefined;
          const options = grouping
            ? await projectOptions(context, grouping, visibilityScope)
            : [];
          const project = options.find(
            (option) => option.value === asked.project,
          )?.value;
          const columns =
            grouping && project
              ? byStatus(
                  await projectMembers(context, {
                    grouping,
                    value: project,
                    visibilityScope,
                  }),
                )
              : await Promise.all(
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
          // Both reads come newest first, so Done keeps the latest finished.
          const finished = done.slice(0, DONE_LIMIT);
          const shown = [open, doing, blocked, finished];
          const selected = asked.card;
          const track =
            asked.trackSource && asked.trackType && asked.trackId
              ? {
                  sourceId: asked.trackSource,
                  entityType: asked.trackType,
                  entityId: asked.trackId,
                  title: asked.trackTitle ?? "",
                  summary: asked.trackSummary ?? "",
                  tracked:
                    (await context.entityService.getEntity({
                      entityType: ACTION_ITEM_ENTITY_TYPE,
                      id: inboxCardId({
                        sourceId: asked.trackSource,
                        entityType: asked.trackType,
                        entityId: asked.trackId,
                      }),
                      visibilityScope,
                    })) !== null,
                }
              : undefined;
          const opened = selected
            ? await context.entityService.getEntity(
                {
                  entityType: ACTION_ITEM_ENTITY_TYPE,
                  id: selected,
                  visibilityScope,
                },
                actionItemSchema,
              )
            : null;
          return {
            cards: shown
              .flatMap((cards) => cards.slice(0, COLUMN_LIMIT))
              .map((entity) => toCard(entity, at)),
            ...(opened ? { open: toOpenCard(opened) } : {}),
            ...(track ? { track } : {}),
            ...(grouping
              ? {
                  projects: {
                    options,
                    ...(project
                      ? {
                          selected: {
                            name: project,
                            counts: COLUMNS.map((column, index) => ({
                              status: column.status,
                              label: column.label,
                              count: shown[index]?.length ?? 0,
                            })),
                            blocked: blocked.map((entity) => ({
                              id: entity.id,
                              title: actionItemTitle(entity),
                            })),
                          },
                        }
                      : {}),
                  },
                }
              : {}),
          };
        },
        actions: [
          moveAction.bind(bindingContext, ({ caller, input }) =>
            move(caller, input),
          ),
          dropAction.bind(bindingContext, ({ caller, input }) =>
            move(caller, { ...input, to: "dropped" }),
          ),
          trackAction.bind(bindingContext, async ({ caller, input }) => {
            if (!caller) {
              throw new Error("Tracking requires a signed-in member");
            }
            const result = await trackInboxItem(
              {
                entityService: context.entityService,
                visibility: deps.visibility,
                now,
              },
              {
                sourceRef: {
                  sourceId: input.sourceId,
                  entityType: input.entityType,
                  entityId: input.entityId,
                },
                title: input.title,
                text: input.text,
                assignee: input.assignee,
                actor: { kind: "user", userId: caller.actor.id },
                actorName: caller.actor.displayName,
              },
            );
            return {
              status:
                result.status === "tracked"
                  ? "Tracked on the board."
                  : "This Inbox item is already on the board.",
            };
          }),
          createAction.bind(bindingContext, async ({ caller, input }) => {
            if (!caller) {
              throw new Error("Adding a card requires a signed-in member");
            }
            await createBoardCard(
              {
                entityService: context.entityService,
                visibility: deps.visibility,
                now,
              },
              {
                title: input.title,
                text: input.text ?? "",
                assignee: input.assignee,
                actor: { kind: "user", userId: caller.actor.id },
                actorName: caller.actor.displayName,
              },
            );
            return { status: "Added to To do." };
          }),
          noteAction.bind(bindingContext, async ({ caller, input }) => {
            if (!caller)
              throw new Error("Adding a note requires a signed-in member");
            const result = await addActionItemNote(
              {
                entityService: context.entityService,
                visibilityScope: permissionToVisibilityScope(caller.permission),
                now,
              },
              {
                id: input.id,
                text: input.text,
                actorName: caller.actor.displayName,
              },
            );
            return {
              status:
                result.status === "noted"
                  ? "Note added."
                  : result.status === "not-found"
                    ? "This card is no longer on the board."
                    : "This card changed while you wrote; add the note again.",
            };
          }),
        ],
      }),
  });
  return result === false ? undefined : result.workspaceUrl;
}
export const BOARD_WORKSPACE_ID = "action-board:board";

/** The Board link a "Track as action item" follow-up opens, prefilled from the Inbox item. */
export function trackHref(
  boardUrl: string,
  sourceId: string,
  item: {
    title: string;
    summary?: string | undefined;
    entityRef?: { entityType: string; entityId: string } | undefined;
  },
): string | undefined {
  if (!item.entityRef) return undefined;
  const query = new URLSearchParams({
    trackSource: sourceId,
    trackType: item.entityRef.entityType,
    trackId: item.entityRef.entityId,
    trackTitle: item.title.slice(0, 160),
    trackSummary: (item.summary ?? "").slice(0, 500),
  });
  return `${boardUrl}?${query.toString()}`;
}
