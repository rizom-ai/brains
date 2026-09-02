import type { ServiceCheckDeclaration } from "@brains/sdk/services";
import { pluralize, resolveUrl } from "@brains/utils/string-utils";
import type { InboxDataSource } from "./inbox-datasource";
import type {
  InboxDigestAlert,
  InboxProjection,
  InboxProjectionEntry,
} from "./schemas";

const HIGH_TITLES_PER_SOURCE = 3;
const DIGEST_SOURCE_LIMIT = 10;

interface CreateInboxDigestOptions {
  destinationUrl: string;
  now?: (() => Date) | undefined;
}

interface InboxDigestOptions {
  now?: (() => Date) | undefined;
}

interface DigestSourceGroup {
  displayName: string;
  entries: InboxProjectionEntry[];
}

export function createUnifiedInboxDigest(
  projection: InboxProjection,
  options: CreateInboxDigestOptions,
): InboxDigestAlert | undefined {
  if (projection.entries.length === 0) return undefined;

  const highCount = projection.entries.filter(
    (entry) => entry.item.urgency === "high",
  ).length;
  const groups = groupBySource(projection.entries);
  const visibleGroups = groups.slice(0, DIGEST_SOURCE_LIMIT);
  const lines = [
    `${projection.entries.length} open attention ${nounFor(
      projection.entries.length,
      "item",
    )} · ${highCount} high priority`,
  ];

  for (const group of visibleGroups) {
    const highEntries = group.entries.filter(
      (entry) => entry.item.urgency === "high",
    );
    lines.push(
      "",
      `${group.displayName} — ${group.entries.length} open · ${highEntries.length} high`,
      ...highEntries
        .slice(0, HIGH_TITLES_PER_SOURCE)
        .map((entry) => `- ${entry.item.title}`),
    );
  }

  const hiddenSources = groups.length - visibleGroups.length;
  if (hiddenSources > 0) {
    lines.push(
      "",
      `+${hiddenSources} more ${nounFor(hiddenSources, "source")}`,
    );
  }

  const unavailable = projection.errors.length;
  lines.push(
    "",
    `${unavailable > 0 ? `${unavailable} ${nounFor(unavailable, "source")} unavailable. ` : ""}Open Inbox: ${options.destinationUrl}`,
  );

  const now = options.now?.() ?? new Date();
  return {
    dedupeKey: `unified-inbox:daily-digest:${now.toISOString().slice(0, 10)}`,
    title: `Inbox digest — ${projection.entries.length} open`,
    body: lines.join("\n"),
  };
}

/**
 * All the digest reads of what a check is handed. Named so a test can drive
 * the run without standing up entity access and a message bus it never
 * touches — a check that composes one string should be testable as one.
 */
export interface InboxDigestCheckContext {
  readonly signal: AbortSignal;
  readonly siteUrl: string | undefined;
  readonly workspaceUrl: (workspaceId: string) => string | undefined;
}

export function runUnifiedInboxDigest(
  dataSource: Pick<InboxDataSource, "getInboxData">,
  options: InboxDigestOptions = {},
): (
  context: InboxDigestCheckContext,
) => Promise<{ alerts: InboxDigestAlert[] }> {
  return async ({ signal, siteUrl, workspaceUrl }) => {
    signal.throwIfAborted();
    const projection = await dataSource.getInboxData();
    signal.throwIfAborted();
    // Without Studio there is no Inbox page to open, so the link goes to the
    // brain itself rather than at a route some other package happens to own.
    const alert = createUnifiedInboxDigest(projection, {
      destinationUrl: resolveUrl(workspaceUrl("inbox") ?? "/", siteUrl),
      ...(options.now ? { now: options.now } : {}),
    });
    return { alerts: alert ? [alert] : [] };
  };
}

export function unifiedInboxDigestCheck(
  dataSource: Pick<InboxDataSource, "getInboxData">,
  options: InboxDigestOptions = {},
): ServiceCheckDeclaration {
  return {
    id: "daily-digest",
    cadence: "daily",
    includeInInbox: false,
    run: runUnifiedInboxDigest(dataSource, options),
  };
}

function groupBySource(entries: InboxProjectionEntry[]): DigestSourceGroup[] {
  const groups = new Map<string, DigestSourceGroup>();
  for (const entry of entries) {
    const sourceId = entry.source.sourceId;
    const group = groups.get(sourceId) ?? {
      displayName: entry.source.displayName,
      entries: [],
    };
    group.entries.push(entry);
    groups.set(sourceId, group);
  }
  return [...groups.values()];
}

function nounFor(count: number, noun: string): string {
  return count === 1 ? noun : pluralize(noun);
}
