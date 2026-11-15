import type {
  InboxSource,
  InboxSourceMetadata,
  ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import {
  inboxProjectionSchema,
  type InboxProjection,
  type InboxProjectionEntry,
  type InboxSourceError,
} from "./schemas";

type InboxSourceReader = Pick<ServiceRuntime["inbox"], "listSources">;

/** Live source-owned operator attention, aggregated across Inbox sources. */
export class InboxDataSource {
  private readonly registry: InboxSourceReader;
  private inFlight: Promise<InboxProjection> | undefined;

  constructor(registry: InboxSourceReader) {
    this.registry = registry;
  }

  /**
   * One page load fans out to badge, workspace, and dashboard reads at once;
   * concurrent calls share a single source fan-out. Nothing is cached beyond
   * the in-flight promise, so sequential reads always see live source state.
   */
  async getInboxData(): Promise<InboxProjection> {
    this.inFlight ??= this.loadProjection().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async loadProjection(): Promise<InboxProjection> {
    const sources = this.registry.listSources();
    const results = await Promise.allSettled(
      sources.map(async (source) => ({
        source,
        items: await source.list(),
      })),
    );
    const entries: InboxProjectionEntry[] = [];
    const errors: InboxSourceError[] = [];

    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      const source = sources[index];
      if (!result || !source) continue;
      const metadata = sourceMetadata(source);
      if (result.status === "rejected") {
        errors.push({ source: metadata, error: "Source unavailable" });
        continue;
      }
      for (const item of result.value.items) {
        entries.push({ source: metadata, item });
      }
    }

    entries.sort(compareEntries);
    errors.sort((left, right) =>
      left.source.sourceId.localeCompare(right.source.sourceId),
    );
    return inboxProjectionSchema.parse({ entries, errors });
  }
}

export function sourceMetadata(source: InboxSource): InboxSourceMetadata {
  return {
    sourceId: source.sourceId,
    displayName: source.displayName,
  };
}

function compareEntries(
  left: InboxProjectionEntry,
  right: InboxProjectionEntry,
): number {
  const urgencyOrder =
    urgencyRank(left.item.urgency) - urgencyRank(right.item.urgency);
  return (
    urgencyOrder ||
    right.item.receivedAt.localeCompare(left.item.receivedAt) ||
    left.source.sourceId.localeCompare(right.source.sourceId) ||
    left.item.id.localeCompare(right.item.id)
  );
}

function urgencyRank(urgency: "high" | "normal"): number {
  return urgency === "high" ? 0 : 1;
}
