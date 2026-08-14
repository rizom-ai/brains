import type {
  IInboxFollowUpRegistry,
  IInboxRegistry,
  InboxActor,
  InboxSource,
} from "@brains/plugins";
import { sourceMetadata, type InboxDataSource } from "./inbox-datasource";
import {
  normalizeInboxListFilter,
  normalizeInboxWorkspaceQuery,
  type InboxActionOutcome,
  type InboxActionRequest,
  type InboxDashboardData,
  type InboxListFilter,
  type InboxListResult,
  type InboxProjection,
  type InboxSourceAvailability,
  type InboxWorkspaceQuery,
  type InboxWorkspaceSnapshot,
} from "./schemas";

type InboxSourceRegistry = Pick<IInboxRegistry, "getSource" | "listSources">;
type InboxFollowUpCatalog = Pick<IInboxFollowUpRegistry, "resolveUniversal">;
type InboxProjectionReader = Pick<InboxDataSource, "getInboxData">;

interface SourceCounts {
  open: number;
  high: number;
}

export class InboxOperatorService {
  private readonly registry: InboxSourceRegistry;
  private readonly dataSource: InboxProjectionReader;
  private readonly followUps: InboxFollowUpCatalog;

  constructor(
    registry: InboxSourceRegistry,
    dataSource: InboxProjectionReader,
    followUps: InboxFollowUpCatalog,
  ) {
    this.registry = registry;
    this.dataSource = dataSource;
    this.followUps = followUps;
  }

  async list(filter: InboxListFilter): Promise<InboxListResult> {
    const projection = await this.dataSource.getInboxData();
    const normalized = normalizeInboxListFilter(
      filter,
      this.registry.listSources(),
    );
    const matching = filterEntries(projection, normalized);
    return {
      entries: matching.slice(0, normalized.limit).map(toListEntry),
      errors: filterErrors(projection, normalized.sourceId),
      total: matching.length,
    };
  }

  async workspace(
    input: unknown,
    actor: InboxActor,
  ): Promise<InboxWorkspaceSnapshot> {
    const query: InboxWorkspaceQuery = normalizeInboxWorkspaceQuery(
      input,
      this.registry.listSources(),
    );
    const projection = await this.dataSource.getInboxData();
    const counts = countBySource(projection.entries);
    const matching = filterEntries(projection, query);
    const page = matching.slice(query.offset, query.offset + query.limit);
    return {
      summary: summarizeProjection(projection, counts),
      sources: this.sourceAvailability(projection, counts),
      entries: await Promise.all(
        page.map(async (entry) => ({
          ...entry,
          followUps: await this.followUps.resolveUniversal({
            sourceId: entry.source.sourceId,
            item: entry.item,
            actor,
          }),
        })),
      ),
      errors: filterErrors(projection, query.sourceId),
      total: matching.length,
      offset: query.offset,
      limit: query.limit,
    };
  }

  async dashboard(managementUrl?: string): Promise<InboxDashboardData> {
    const projection = await this.dataSource.getInboxData();
    const counts = countBySource(projection.entries);
    const sources = this.sourceAvailability(projection, counts);
    const availableSources = sources.filter(
      (source) => source.available,
    ).length;
    return {
      summary: {
        ...summarizeProjection(projection, counts),
        availableSources,
        unavailableSources: sources.length - availableSources,
      },
      entries: projection.entries.slice(0, 5).map((entry) => ({
        sourceLabel: entry.source.displayName,
        urgency: entry.item.urgency,
        title: entry.item.title,
        receivedAt: entry.item.receivedAt,
      })),
      ...(managementUrl ? { managementUrl } : {}),
    };
  }

  async badge(): Promise<number> {
    return (await this.dataSource.getInboxData()).entries.length;
  }

  async act(
    request: InboxActionRequest,
    actor: InboxActor,
  ): Promise<InboxActionOutcome> {
    const source = this.registry.getSource(request.sourceId);
    const offered = source
      ? await findOfferedAction(source, request.itemId, request.actionId)
      : undefined;
    if (!source || !offered) {
      throw new Error("Inbox item or action not found");
    }

    if (offered.action.confirm === true && !request.confirmed) {
      return {
        kind: "confirmation",
        summary: `${offered.action.label} "${offered.title}"?`,
      };
    }

    await source.act(request.itemId, request.actionId, actor);
    return { kind: "completed" };
  }

  private sourceAvailability(
    projection: InboxProjection,
    counts: Map<string, SourceCounts>,
  ): InboxSourceAvailability[] {
    const unavailable = new Set(
      projection.errors.map((error) => error.source.sourceId),
    );
    return this.registry.listSources().map((source) => ({
      source: {
        ...sourceMetadata(source),
        ...(source.facets ? { facets: source.facets } : {}),
      },
      ...(counts.get(source.sourceId) ?? { open: 0, high: 0 }),
      available: !unavailable.has(source.sourceId),
    }));
  }
}

function countBySource(
  entries: InboxProjection["entries"],
): Map<string, SourceCounts> {
  return entries.reduce((counts, entry) => {
    const bucket = counts.get(entry.source.sourceId) ?? { open: 0, high: 0 };
    bucket.open += 1;
    if (entry.item.urgency === "high") bucket.high += 1;
    return counts.set(entry.source.sourceId, bucket);
  }, new Map<string, SourceCounts>());
}

function filterEntries(
  projection: InboxProjection,
  filter: {
    sourceId?: string | undefined;
    urgency?: string | undefined;
    facets?: Record<string, string> | undefined;
  },
): InboxProjection["entries"] {
  return projection.entries.filter(
    (entry) =>
      (filter.sourceId === undefined ||
        entry.source.sourceId === filter.sourceId) &&
      (filter.urgency === undefined || entry.item.urgency === filter.urgency) &&
      Object.entries(filter.facets ?? {}).every(
        ([key, value]) => entry.item.facets?.[key] === value,
      ),
  );
}

function toListEntry(
  entry: InboxProjection["entries"][number],
): InboxListResult["entries"][number] {
  return {
    source: entry.source,
    item: {
      title: entry.item.title,
      ...(entry.item.summary ? { summary: entry.item.summary } : {}),
      ...(entry.item.contact ? { contact: entry.item.contact } : {}),
      receivedAt: entry.item.receivedAt,
      urgency: entry.item.urgency,
    },
  };
}

function filterErrors(
  projection: InboxProjection,
  sourceId: string | undefined,
): InboxProjection["errors"] {
  return projection.errors.filter(
    (error) => sourceId === undefined || error.source.sourceId === sourceId,
  );
}

function summarizeProjection(
  projection: InboxProjection,
  counts: Map<string, SourceCounts>,
): { open: number; high: number } {
  return {
    open: projection.entries.length,
    high: [...counts.values()].reduce(
      (total, bucket) => total + bucket.high,
      0,
    ),
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
