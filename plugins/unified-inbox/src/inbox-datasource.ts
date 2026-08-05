import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
  IInboxRegistry,
  InboxSource,
  InboxSourceMetadata,
} from "@brains/plugins";
import {
  inboxProjectionSchema,
  type InboxProjection,
  type InboxProjectionEntry,
  type InboxSourceError,
} from "./schemas";

type InboxSourceReader = Pick<IInboxRegistry, "listSources">;

export class InboxDataSource implements DataSource {
  readonly id: string = "unified-inbox:inbox";
  readonly name: string = "Unified Inbox DataSource";
  readonly description: string =
    "Aggregates live source-owned operator attention";

  private readonly registry: InboxSourceReader;

  constructor(registry: InboxSourceReader) {
    this.registry = registry;
  }

  async getInboxData(): Promise<InboxProjection> {
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

  async fetch<T>(
    _query: unknown,
    outputSchema: DataSourceSchema<T>,
    _context: BaseDataSourceContext,
  ): Promise<T> {
    return outputSchema.parse(await this.getInboxData());
  }
}

function sourceMetadata(source: InboxSource): InboxSourceMetadata {
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
