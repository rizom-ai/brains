import {
  defineCmsWorkspace,
  defineEntity,
  defineWorkspaceAction,
  registerBuiltInCmsWorkspace,
  type OperatorCapabilityDefinition,
  type OperatorViewBlock,
  type ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { InboxOperatorService } from "./operator-service";
import {
  inboxDetailOutcomeSchema,
  inboxWorkspaceQuerySchema,
  inboxWorkspaceSnapshotSchema,
} from "./schemas";

const inboxCapabilitySchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  confirmation: z.literal("prepared").optional(),
});
const inboxActionInputSchema = z.object({
  sourceId: z.string().trim().min(1).max(120),
  itemId: z.string().trim().min(1).max(500),
  capability: inboxCapabilitySchema,
});

const runInboxAction = defineWorkspaceAction({
  name: "run-inbox-action",
  label: "Run inbox action",
  catalog: true,
  permission: "admin",
  confirmation: { kind: "prepared", conditional: true },
  input: inboxActionInputSchema,
  output: z.object({ kind: z.literal("completed") }),
});

const personEntity = defineEntity({
  type: "person",
  purpose: "A known person associated with operator work",
  metadata: z.object({}),
});

function normalizeFlatInboxQuery(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return input;
  }
  const base: Record<string, unknown> = {};
  const facets: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key.startsWith("facet.")) facets[key.slice("facet.".length)] = value;
    else base[key] = value;
  }
  return {
    ...base,
    ...(Object.keys(facets).length > 0 ? { facets } : {}),
  };
}

const declarativeInboxQuerySchema = z.preprocess(
  normalizeFlatInboxQuery,
  inboxWorkspaceQuerySchema,
);
const declarativeInboxDataSchema = z.object({
  query: inboxWorkspaceQuerySchema,
  snapshot: inboxWorkspaceSnapshotSchema,
  detail: inboxDetailOutcomeSchema.optional(),
});

const inboxWorkspace = defineCmsWorkspace({
  id: "inbox",
  label: "Inbox",
  priority: 20,
  permission: "admin",
  query: declarativeInboxQuerySchema,
  data: declarativeInboxDataSchema,
  actions: [runInboxAction],
  badge: ({ data }) => data.snapshot.summary.open,
  view: ({ data }) => {
    type InboxViewBlock = OperatorViewBlock<typeof runInboxAction>;
    type InboxLink = Extract<
      InboxViewBlock,
      { type: "links" }
    >["items"][number];
    const { query, snapshot } = data;
    const selectedSource = snapshot.sources.find(
      (source) => source.source.sourceId === query.sourceId,
    );
    const queryControls: Extract<
      InboxViewBlock,
      { type: "query" }
    >["controls"] = [
      {
        key: "sourceId",
        label: "Source",
        value: query.sourceId,
        allLabel: "All sources",
        options: snapshot.sources.map((source) => ({
          value: source.source.sourceId,
          label: source.source.displayName,
          count: source.open,
        })),
      },
      {
        key: "urgency",
        label: "Urgency",
        value: query.urgency,
        allLabel: "All urgency",
        options: [
          {
            value: "high",
            label: "High priority",
            count: snapshot.summary.high,
          },
          { value: "normal", label: "Normal" },
        ],
      },
      ...(selectedSource?.source.facets ?? []).map((facet) => ({
        key: `facet.${facet.key}`,
        label: facet.label,
        value: query.facets?.[facet.key],
        allLabel: "All",
        options: facet.values,
      })),
    ];
    const errorBlocks: InboxViewBlock[] = snapshot.errors.map(
      (error, index) => ({
        type: "notice",
        id: `source-error-${index + 1}`,
        title: error.source.displayName,
        text: "This inbox source is temporarily unavailable.",
        tone: "warn",
      }),
    );
    const detailBlocks: InboxViewBlock[] = data.detail
      ? data.detail.kind === "detail"
        ? [
            {
              type: "text",
              id: "inbox-detail",
              label: "Original content",
              text: data.detail.detail.text,
              truncated: data.detail.detail.truncated,
            },
          ]
        : [
            {
              type: "notice",
              id: "inbox-detail-unavailable",
              title: "Original content",
              text: data.detail.error,
              tone: "warn",
            },
          ]
      : [];
    const blocks: InboxViewBlock[] = [
      {
        type: "stats",
        id: "inbox-summary",
        items: [
          { label: "Open", value: snapshot.summary.open },
          {
            label: "High priority",
            value: snapshot.summary.high,
            tone: snapshot.summary.high > 0 ? "warn" : "good",
          },
          { label: "Matching", value: snapshot.total },
          {
            label: "Sources online",
            value: snapshot.sources.filter((source) => source.available).length,
          },
        ],
      },
      {
        type: "query",
        id: "inbox-query",
        controls: queryControls,
        pagination: {
          offset: snapshot.offset,
          limit: snapshot.limit,
          total: snapshot.total,
        },
      },
      ...detailBlocks,
      {
        type: "group",
        id: "source-health",
        label: "Source availability",
        items: snapshot.sources.map((source) => ({
          id: source.source.sourceId,
          label: source.source.displayName,
          value: source.available ? source.open : "Unavailable",
          tone: source.available ? "neutral" : "warn",
          description: `${source.high} high priority`,
        })),
      },
      {
        type: "list",
        id: "inbox-items",
        empty: "Nothing needs attention for these filters.",
        items: snapshot.entries.map((entry, index) => {
          const entityRef = entry.item.entityRef;
          const links: InboxLink[] = [];
          if (entry.item.contact?.personId) {
            links.push({
              label: `Open contact ${entry.item.contact.label}`,
              target: {
                entity: personEntity,
                id: entry.item.contact.personId,
              },
            });
          }
          if (entry.detailAvailable) {
            links.push({
              label: "Read original",
              target: {
                launch: {
                  target: "inbox-open-detail",
                  sourceId: entry.source.sourceId,
                  itemId: entry.item.id,
                },
              },
            });
          }
          for (const followUp of entry.followUps) {
            if (followUp.kind === "discuss-in-chat") {
              links.push({
                label: followUp.label,
                target: {
                  launch: {
                    target: "inbox-discuss-in-chat",
                    sourceId: entry.source.sourceId,
                    itemId: entry.item.id,
                    label: entry.item.title,
                  },
                },
              });
            } else if (followUp.kind === "open-entity" && entityRef) {
              links.push({
                label: followUp.label,
                target: {
                  launch: {
                    target: "inbox-open-entity",
                    entityType: entityRef.entityType,
                    entityId: entityRef.entityId,
                  },
                },
              });
            } else if (followUp.kind === "capture-as-note" && entityRef) {
              links.push({
                label: followUp.label,
                target: {
                  launch: {
                    target: "inbox-capture-note",
                    title: entry.item.title,
                    ...(entry.item.summary
                      ? { summary: entry.item.summary }
                      : {}),
                    entityType: entityRef.entityType,
                    entityId: entityRef.entityId,
                  },
                },
              });
            }
          }
          return {
            id: `inbox-item-${index + 1}`,
            title: entry.item.title,
            description: entry.item.summary,
            metadata: [
              entry.source.displayName,
              entry.item.receivedAt,
              ...(entry.item.threadOrdinal === undefined
                ? []
                : [`Message ${entry.item.threadOrdinal} in thread`]),
            ],
            badges: [
              {
                label: `${entry.item.urgency} priority`,
                tone: entry.item.urgency === "high" ? "warn" : "neutral",
              },
            ],
            ...(links.length > 0 ? { links } : {}),
            actions: entry.item.actions.map((action) => {
              const capability: OperatorCapabilityDefinition = {
                id: action.id,
                label: action.label,
                ...(action.confirm === true
                  ? { confirmation: "prepared" }
                  : {}),
              };
              return {
                action: runInboxAction,
                capability,
                input: {
                  sourceId: entry.source.sourceId,
                  itemId: entry.item.id,
                  capability,
                },
              };
            }),
          };
        }),
      },
      ...errorBlocks,
    ];
    return { title: "Inbox", blocks };
  },
});

export async function registerUnifiedInboxCmsWorkspace(
  context: ServicePluginContext,
  operator: InboxOperatorService,
): Promise<string | undefined> {
  const result = await registerBuiltInCmsWorkspace({
    context,
    definition: inboxWorkspace,
    bind: (bindingContext) =>
      inboxWorkspace.bind(bindingContext, {
        load: async ({ query, caller, signal }) => {
          if (!caller) throw new Error("Unified inbox requires authentication");
          const normalized = query.get(declarativeInboxQuerySchema);
          const actor = { permissionLevel: caller.permission };
          const snapshot = await operator.workspace(normalized, actor);
          const detail =
            normalized.detailSourceId && normalized.detailItemId
              ? await operator.detail(
                  {
                    type: "detail",
                    sourceId: normalized.detailSourceId,
                    itemId: normalized.detailItemId,
                  },
                  actor,
                  signal,
                )
              : undefined;
          return {
            query: normalized,
            snapshot,
            ...(detail ? { detail } : {}),
          };
        },
        actions: [
          runInboxAction.bind(
            bindingContext,
            async ({ input, caller }) => {
              if (!caller) {
                throw new Error("Unified inbox requires authentication");
              }
              const outcome = await operator.act(
                {
                  sourceId: input.sourceId,
                  itemId: input.itemId,
                  actionId: input.capability.id,
                  confirmed: true,
                },
                { permissionLevel: caller.permission },
              );
              if (outcome.kind !== "completed") {
                throw new Error("Inbox action did not complete");
              }
              return outcome;
            },
            async ({ input }) =>
              operator.prepareAction({
                sourceId: input.sourceId,
                itemId: input.itemId,
                actionId: input.capability.id,
              }),
          ),
        ],
      }),
  });
  return result === false ? undefined : result.workspaceUrl;
}
