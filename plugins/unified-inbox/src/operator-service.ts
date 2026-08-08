import type { IInboxRegistry, InboxActor, InboxSource } from "@brains/plugins";
import type { InboxDataSource } from "./inbox-datasource";
import {
  inboxActionOutcomeSchema,
  inboxActionRequestSchema,
  inboxDashboardDataSchema,
  inboxListFilterSchema,
  inboxListResultSchema,
  inboxWorkspaceQuerySchema,
  inboxWorkspaceSnapshotSchema,
  type InboxActionOutcome,
  type InboxDashboardData,
  type InboxListResult,
  type InboxProjection,
  type InboxSourceAvailability,
  type InboxWorkspaceSnapshot,
} from "./schemas";

type InboxSourceRegistry = Pick<IInboxRegistry, "getSource" | "listSources">;
type InboxProjectionReader = Pick<InboxDataSource, "getInboxData">;

export class InboxOperatorService {
  private readonly registry: InboxSourceRegistry;
  private readonly dataSource: InboxProjectionReader;

  constructor(
    registry: InboxSourceRegistry,
    dataSource: InboxProjectionReader,
  ) {
    this.registry = registry;
    this.dataSource = dataSource;
  }

  async list(input: unknown): Promise<InboxListResult> {
    const filter = inboxListFilterSchema.parse(input);
    const projection = await this.dataSource.getInboxData();
    const matching = filterEntries(projection, filter);
    return inboxListResultSchema.parse({
      entries: matching.slice(0, filter.limit),
      errors: filterErrors(projection, filter.sourceId),
      total: matching.length,
    });
  }

  async workspace(input: unknown): Promise<InboxWorkspaceSnapshot> {
    const query = inboxWorkspaceQuerySchema.parse(input);
    const projection = await this.dataSource.getInboxData();
    const matching = filterEntries(projection, query);
    return inboxWorkspaceSnapshotSchema.parse({
      summary: summarizeProjection(projection),
      sources: this.sourceAvailability(projection),
      entries: matching.slice(query.offset, query.offset + query.limit),
      errors: filterErrors(projection, query.sourceId),
      total: matching.length,
      offset: query.offset,
      limit: query.limit,
    });
  }

  async dashboard(managementUrl?: string): Promise<InboxDashboardData> {
    const projection = await this.dataSource.getInboxData();
    const summary = summarizeProjection(projection);
    const sources = this.sourceAvailability(projection);
    return inboxDashboardDataSchema.parse({
      summary: {
        ...summary,
        availableSources: sources.filter((source) => source.available).length,
        unavailableSources: sources.filter((source) => !source.available)
          .length,
      },
      entries: projection.entries.slice(0, 5).map((entry) => ({
        sourceLabel: entry.source.displayName,
        urgency: entry.item.urgency,
        title: entry.item.title,
        receivedAt: entry.item.receivedAt,
      })),
      ...(managementUrl ? { managementUrl } : {}),
    });
  }

  async badge(): Promise<number> {
    return (await this.dataSource.getInboxData()).entries.length;
  }

  async act(input: unknown, actor: InboxActor): Promise<InboxActionOutcome> {
    const request = inboxActionRequestSchema.parse(input);
    const source = this.registry.getSource(request.sourceId);
    const offered = source
      ? await findOfferedAction(source, request.itemId, request.actionId)
      : undefined;
    if (!source || !offered) {
      throw new Error("Inbox item or action not found");
    }

    if (offered.action.confirm === true && !request.confirmed) {
      return inboxActionOutcomeSchema.parse({
        kind: "confirmation",
        summary: `${offered.action.label} "${offered.title}"?`,
      });
    }

    await source.act(request.itemId, request.actionId, actor);
    return inboxActionOutcomeSchema.parse({ kind: "completed" });
  }

  private sourceAvailability(
    projection: InboxProjection,
  ): InboxSourceAvailability[] {
    const unavailable = new Set(
      projection.errors.map((error) => error.source.sourceId),
    );
    return this.registry
      .listSources()
      .map((source) => {
        const entries = projection.entries.filter(
          (entry) => entry.source.sourceId === source.sourceId,
        );
        return {
          source: {
            sourceId: source.sourceId,
            displayName: source.displayName,
          },
          open: entries.length,
          high: entries.filter((entry) => entry.item.urgency === "high").length,
          available: !unavailable.has(source.sourceId),
        };
      })
      .sort((left, right) =>
        left.source.sourceId.localeCompare(right.source.sourceId),
      );
  }
}

function filterEntries(
  projection: InboxProjection,
  filter: { sourceId?: string | undefined; urgency?: string | undefined },
): InboxProjection["entries"] {
  return projection.entries.filter(
    (entry) =>
      (filter.sourceId === undefined ||
        entry.source.sourceId === filter.sourceId) &&
      (filter.urgency === undefined || entry.item.urgency === filter.urgency),
  );
}

function filterErrors(
  projection: InboxProjection,
  sourceId: string | undefined,
): InboxProjection["errors"] {
  return projection.errors.filter(
    (error) => sourceId === undefined || error.source.sourceId === sourceId,
  );
}

function summarizeProjection(projection: InboxProjection): {
  open: number;
  high: number;
} {
  return {
    open: projection.entries.length,
    high: projection.entries.filter((entry) => entry.item.urgency === "high")
      .length,
  };
}

async function findOfferedAction(
  source: InboxSource,
  itemId: string,
  actionId: string,
): Promise<
  | {
      title: string;
      action: { id: string; label: string; confirm?: boolean | undefined };
    }
  | undefined
> {
  const item = (await source.list()).find(
    (candidate) => candidate.id === itemId,
  );
  const action = item?.actions.find((candidate) => candidate.id === actionId);
  return item && action ? { title: item.title, action } : undefined;
}
