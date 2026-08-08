import type { ServicePluginContext } from "@brains/plugins";
import type { InboxDataSource } from "./inbox-datasource";
import {
  inboxDigestAlertSchema,
  inboxProjectionSchema,
  type InboxDigestAlert,
  type InboxProjection,
  type InboxProjectionEntry,
} from "./schemas";

const HIGH_TITLES_PER_SOURCE = 3;
const DIGEST_SOURCE_LIMIT = 10;

interface CreateInboxDigestOptions {
  destinationUrl: string;
  now?: (() => Date) | undefined;
}

interface InboxDigestContext {
  siteUrl: ServicePluginContext["siteUrl"];
  recurringChecks: ServicePluginContext["recurringChecks"];
  webRoutes: Pick<ServicePluginContext["webRoutes"], "getRoutes">;
}

interface DigestSourceGroup {
  displayName: string;
  entries: InboxProjectionEntry[];
}

export function createUnifiedInboxDigest(
  input: InboxProjection,
  options: CreateInboxDigestOptions,
): InboxDigestAlert | undefined {
  const projection = inboxProjectionSchema.parse(input);
  if (projection.entries.length === 0) return undefined;

  const highCount = projection.entries.filter(
    (entry) => entry.item.urgency === "high",
  ).length;
  const groups = groupBySource(projection.entries);
  const visibleGroups = groups.slice(0, DIGEST_SOURCE_LIMIT);
  const lines = [
    `${projection.entries.length} open attention ${
      projection.entries.length === 1 ? "item" : "items"
    } · ${highCount} high priority`,
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
      `+${hiddenSources} more ${hiddenSources === 1 ? "source" : "sources"}`,
    );
  }

  const unavailable = projection.errors.length;
  lines.push(
    "",
    `${unavailable > 0 ? `${unavailable} ${unavailable === 1 ? "source" : "sources"} unavailable. ` : ""}Open Inbox: ${options.destinationUrl}`,
  );

  const now = options.now?.() ?? new Date();
  return inboxDigestAlertSchema.parse({
    dedupeKey: `unified-inbox:daily-digest:${now.toISOString().slice(0, 10)}`,
    title: `Inbox digest — ${projection.entries.length} open`,
    body: lines.join("\n"),
  });
}

export function registerUnifiedInboxDigest(
  context: InboxDigestContext,
  dataSource: Pick<InboxDataSource, "getInboxData">,
  now?: () => Date,
  workspaceUrl?: string,
): void {
  const destinationUrl = resolveDestinationUrl(context, workspaceUrl);
  context.recurringChecks.register({
    id: "daily-digest",
    cadence: "daily",
    run: async ({ signal }) => {
      signal.throwIfAborted();
      const projection = await dataSource.getInboxData();
      signal.throwIfAborted();
      const alert = createUnifiedInboxDigest(projection, {
        destinationUrl,
        ...(now ? { now } : {}),
      });
      return { alerts: alert ? [alert] : [] };
    },
  });
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

function resolveDestinationUrl(
  context: InboxDigestContext,
  workspaceUrl?: string,
): string {
  const path =
    workspaceUrl ??
    context.webRoutes
      .getRoutes()
      .find(
        (route) =>
          route.pluginId === "dashboard" &&
          (route.definition.method ?? "GET") === "GET",
      )?.fullPath ??
    "/dashboard";
  return context.siteUrl ? new URL(path, context.siteUrl).toString() : path;
}
