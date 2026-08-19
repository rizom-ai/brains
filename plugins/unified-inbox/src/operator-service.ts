import { createHash } from "node:crypto";
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
  splitInboxRowId,
  type InboxActionOutcome,
  type InboxActionRequest,
  type InboxDashboardData,
  type InboxDetailOutcome,
  type InboxDetailRequest,
  type InboxListFilter,
  type InboxListResult,
  type InboxProjection,
  type InboxSourceAvailability,
  type InboxWorkspaceQuery,
  type InboxWorkspaceSnapshot,
} from "./schemas";

type InboxSourceRegistry = Pick<IInboxRegistry, "getSource" | "listSources">;
type InboxFollowUpCatalog = Pick<IInboxFollowUpRegistry, "resolve">;
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
    const resolveEntry = async (
      entry: InboxProjection["entries"][number],
    ): Promise<InboxWorkspaceSnapshot["entries"][number]> => ({
      ...entry,
      detailAvailable:
        this.registry.getSource(entry.source.sourceId)?.resolveDetail !==
        undefined,
      followUps: await this.followUps.resolve({
        sourceId: entry.source.sourceId,
        item: entry.item,
        actor,
      }),
    });
    const entries = await Promise.all(page.map(resolveEntry));
    const selection = query.selected
      ? splitInboxRowId(query.selected)
      : undefined;
    const selectedProjectionEntry = selection
      ? projection.entries.find(
          (entry) =>
            entry.source.sourceId === selection.sourceId &&
            entry.item.id === selection.itemId,
        )
      : undefined;
    const selectedFromPage = selection
      ? entries.find(
          (entry) =>
            entry.source.sourceId === selection.sourceId &&
            entry.item.id === selection.itemId,
        )
      : undefined;
    const selectedEntry =
      selectedFromPage ??
      (selectedProjectionEntry
        ? await resolveEntry(selectedProjectionEntry)
        : undefined);
    return {
      summary: summarizeProjection(projection, counts),
      sources: this.sourceAvailability(projection, counts),
      entries,
      ...(selectedEntry ? { selectedEntry } : {}),
      errors: filterErrors(projection, query.sourceId),
      total: matching.length,
      offset: query.offset,
      limit: query.limit,
    };
  }

  async dashboard(): Promise<InboxDashboardData> {
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
    };
  }

  async badge(): Promise<number> {
    return (await this.dataSource.getInboxData()).entries.length;
  }

  async detail(
    request: InboxDetailRequest,
    actor: InboxActor,
    requestSignal?: AbortSignal,
  ): Promise<InboxDetailOutcome> {
    if (actor.permissionLevel !== "admin") {
      return detailUnavailable();
    }
    const source = this.registry.getSource(request.sourceId);
    if (!source?.resolveDetail) return detailUnavailable();

    try {
      const offered = (await source.list()).some(
        (candidate) => candidate.id === request.itemId,
      );
      if (!offered) return detailUnavailable();
      const timeout = AbortSignal.timeout(10_000);
      const signal = requestSignal
        ? AbortSignal.any([requestSignal, timeout])
        : timeout;
      if (signal.aborted) return detailUnavailable();
      const detail = await source.resolveDetail(request.itemId, actor, signal);
      return { kind: "detail", detail };
    } catch {
      return detailUnavailable();
    }
  }

  async prepareAction(request: Omit<InboxActionRequest, "confirmed">): Promise<{
    summary: string;
    revision: string;
  }> {
    const source = this.registry.getSource(request.sourceId);
    const offered = source
      ? await findOfferedAction(source, request.itemId, request.actionId)
      : undefined;
    if (!source || !offered) {
      throw new Error("Inbox item or action not found");
    }
    return {
      summary: `${offered.action.label} "${offered.title}"?`,
      revision: createHash("sha256")
        .update(
          JSON.stringify({
            sourceId: request.sourceId,
            itemId: request.itemId,
            actionId: offered.action.id,
            actionLabel: offered.action.label,
            confirm: offered.action.confirm === true,
            title: offered.title,
          }),
        )
        .digest("hex"),
    };
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

function detailUnavailable(): InboxDetailOutcome {
  return {
    kind: "detail-unavailable",
    error: "Original content is unavailable",
  };
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
