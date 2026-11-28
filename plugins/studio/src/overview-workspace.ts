import {
  DECLARATIVE_STUDIO_WORKSPACE_RENDERER,
  entityCreatedChannel,
  entityDeletedChannel,
  entityUpdatedChannel,
  safeParseRuntimeDashboardWidgetData,
  studioOverviewContributionSchema,
  type DashboardDigestLine,
  type EntityChangePayload,
  type RuntimeDashboardWidgetData,
  type RuntimeStudioOperatorCardBlock,
  type RuntimeStudioOperatorPanelBlock,
  type RuntimeStudioOperatorViewFact,
  type RuntimeStudioWorkspaceData,
  type StudioOverviewContributionRegistration,
  type StudioOverviewContributionUnregistration,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
  hasPermission,
  type ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import {
  jobProgressChannel,
  type JobProgressEvent,
} from "@brains/sdk/internal/interface-runtime";
import type { UserPermissionLevel } from "@brains/sdk/interfaces";
import { z } from "@brains/utils/zod";
import { capitalize, truncateText } from "@brains/utils/string-utils";
import { entityDisplayTitle } from "./editor-entities";
import { entityTypeLabels, type EntityDisplayLabel } from "./config";
import {
  STUDIO_HISTORY_WORKSPACE_ID,
  STUDIO_OVERVIEW_REFRESH_MS,
  STUDIO_OVERVIEW_WORKSPACE_ID,
} from "./overview-constants";
import type { StudioContext } from "./studio-context";
import type { StudioWorkspaceRegistry } from "./workspace-registry";

export {
  STUDIO_HISTORY_WORKSPACE_ID,
  STUDIO_OVERVIEW_REFRESH_MS,
  STUDIO_OVERVIEW_WORKSPACE_ID,
} from "./overview-constants";

type RuntimeStudioOperatorListItem = Extract<
  RuntimeStudioOperatorPanelBlock,
  { type: "list" }
>["items"][number];

export type StoredContribution = z.output<
  typeof studioOverviewContributionSchema
>;

/** How the activity feed names an entry and its type. */
export type DescribeEntityActivity = (
  entityType: string,
  entity: EntityChangePayload["entity"],
  entityId: string,
) => EntityActivityDescription | Promise<EntityActivityDescription>;

interface EntityActivityDescription {
  title: string | undefined;
  typeLabel: string;
}

const describeByType: DescribeEntityActivity = (entityType) => ({
  title: undefined,
  typeLabel: entityTypeLabels(entityType).label,
});

/** One line of the feed, as it is shown and as it is kept between runs. */
export const overviewActivitySchema: z.ZodObject<{
  id: z.ZodString;
  at: z.ZodISODateTime;
  title: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  metadata: z.ZodArray<z.ZodString>;
  tone: z.ZodEnum<{
    good: "good";
    warn: "warn";
    neutral: "neutral";
    error: "error";
  }>;
  link: z.ZodOptional<
    z.ZodObject<{
      kind: z.ZodLiteral<"entity">;
      entityType: z.ZodString;
      id: z.ZodString;
    }>
  >;
}> = z.object({
  id: z.string().min(1),
  /** When the event happened, as an ISO timestamp. */
  at: z.iso.datetime(),
  title: z.string(),
  description: z.string().optional(),
  metadata: z.array(z.string()),
  tone: z.enum(["good", "warn", "neutral", "error"]),
  link: z
    .object({
      kind: z.literal("entity"),
      entityType: z.string(),
      id: z.string(),
    })
    .optional(),
});

export type OverviewActivity = z.output<typeof overviewActivitySchema>;

/** Where the feed is kept between runs: a runtime-state store of its lines. */
export interface OverviewActivityStore {
  set(key: string, value: OverviewActivity): Promise<void>;
  delete(key: string): Promise<boolean>;
  list(options?: {
    readonly afterKey?: string | undefined;
    readonly limit?: number | undefined;
  }): Promise<
    ReadonlyArray<{ readonly key: string; readonly value: OverviewActivity }>
  >;
}

const STORE_PAGE = 1000;

export interface LoadedContribution {
  readonly contribution: StoredContribution;
  readonly data?: RuntimeDashboardWidgetData | undefined;
  readonly digest: readonly DashboardDigestLine[];
  readonly attention: number;
  readonly failed: boolean;
}

const permissionRank: Record<UserPermissionLevel, number> = {
  public: 0,
  trusted: 1,
  admin: 2,
};

function admitted(
  permission: UserPermissionLevel,
  floor: UserPermissionLevel,
): boolean {
  return permissionRank[permission] >= permissionRank[floor];
}

function boundedId(prefix: string, value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_.-]+/g, "-");
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  const suffix = (hash >>> 0).toString(36);
  const stemLength = Math.max(0, 118 - prefix.length - suffix.length);
  return `${prefix}-${normalized.slice(0, stemLength)}-${suffix}`;
}

const ACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const JOB_ACTIVITY = "Job activity";
/** A job message's length in the feed, ellipsis included. */
const JOB_MESSAGE_LIMIT = 497;
const MAX_ACTIVITY = 500;

/** "site:build" reads as "Site build". */
function jobName(jobType: string): string {
  const words = jobType
    .split(/[-_:.\s]+/)
    .filter(Boolean)
    .join(" ");
  return capitalize(words);
}

function derivedDigest(
  contribution: StoredContribution,
  data: RuntimeDashboardWidgetData,
  rawData: unknown,
): { digest: readonly DashboardDigestLine[]; attention: number } {
  let live:
    | {
        digest?: DashboardDigestLine[] | undefined;
        needsAttention?: number | undefined;
      }
    | undefined;
  try {
    live = contribution.digestProvider?.(rawData);
  } catch {
    live = undefined;
  }
  return {
    digest: live?.digest ?? data.digest?.items ?? contribution.digest ?? [],
    attention:
      live?.needsAttention ??
      data.digest?.attention ??
      contribution.needsAttention ??
      0,
  };
}

/** A run of the same change within one hour reads as one line. */
function sameRun(head: OverviewActivity, item: OverviewActivity): boolean {
  return (
    head.link !== undefined &&
    item.link !== undefined &&
    head.metadata[0] === item.metadata[0] &&
    head.at.slice(0, 13) === item.at.slice(0, 13)
  );
}

function historyItem(item: OverviewActivity): RuntimeStudioOperatorListItem {
  return {
    id: item.id,
    title: item.title,
    ...(item.description ? { description: item.description } : {}),
    at: item.at,
    // The log shows the time itself; a job needs no "job" label.
    metadata: item.metadata.filter(
      (value) => value !== item.at && value !== JOB_ACTIVITY,
    ),
    tone: item.tone,
    ...(item.link ? { link: item.link } : {}),
  };
}

/**
 * What happened, newest first: repeated saves of one entry read once, and a
 * batch of the same change reads as one line naming the first and the count.
 */
export function historyItems(
  activity: readonly OverviewActivity[],
): RuntimeStudioOperatorListItem[] {
  const runs = activity.reduce<OverviewActivity[][]>((groups, item) => {
    const run = groups.at(-1);
    const head = run?.[0];
    return run && head && sameRun(head, item)
      ? [...groups.slice(0, -1), [...run, item]]
      : [...groups, [item]];
  }, []);
  return runs.flatMap((run) => {
    const [head] = run;
    if (!head) return [];
    const titles = [...new Set(run.map((item) => item.title))];
    if (titles.length === 1) return [historyItem(head)];
    const shown = titles.slice(0, 6).join(", ");
    const { link: _link, ...line } = historyItem(head);
    return [
      {
        ...line,
        id: boundedId("run", head.id),
        title: `${titles[0]} and ${titles.length - 1} more`,
        description: titles.length > 6 ? `${shown}, …` : shown,
      },
    ];
  });
}

function historyCard(
  activity: readonly OverviewActivity[],
): RuntimeStudioOperatorCardBlock {
  return {
    type: "card",
    id: "history-activity",
    label: "What happened",
    blocks: [
      {
        type: "list",
        id: "history-activity-list",
        presentation: "log",
        empty: "Nothing has happened in the last week.",
        items: historyItems(activity),
      },
    ],
  };
}

/** Standing facts about the brain itself, read once per Overview load. */
export interface BrainFacts {
  readonly runtime: string;
  readonly degraded: boolean;
  readonly activeJobs: number;
  readonly failedJobs: number;
  readonly version: string;
  readonly interactions: number;
  readonly channels: number;
  readonly inboxSources: number;
  readonly entityTypes: number;
}

export async function brainFacts(
  context: StudioContext,
  actor: StudioWorkspaceActor,
): Promise<BrainFacts> {
  const [appInfoResult, readinessResult, countsResult] =
    await Promise.allSettled([
      context.identity.getAppInfo(),
      context.readiness(),
      context.entityService.getEntityCounts(actor.visibilityScope),
    ]);
  const appInfo =
    appInfoResult.status === "fulfilled" ? appInfoResult.value : null;
  const readiness =
    readinessResult.status === "fulfilled" ? readinessResult.value : null;
  const counts = countsResult.status === "fulfilled" ? countsResult.value : [];
  const queue = readiness?.resources.queue;
  const pending = queue?.totals.pending ?? 0;
  const processing = queue?.totals.processing ?? 0;
  const failed = queue?.totals.failed ?? 0;
  const visibleInteractions =
    appInfo?.interactions.filter((interaction) =>
      hasPermission(actor.userPermissionLevel, interaction.visibility),
    ).length ?? 0;
  let channels = 0;
  let inboxSources = 0;
  try {
    channels = context.channelDescriptors().length;
  } catch {
    // Registration can still be finalizing in tests or a warming runtime.
  }
  try {
    inboxSources = context.inbox.listSources().length;
  } catch {
    // Overview degrades to zero sources rather than failing the whole view.
  }

  return {
    runtime: readiness?.operationalStatus ?? "unavailable",
    degraded: readiness?.operationalStatus === "degraded",
    activeJobs: pending + processing,
    failedJobs: failed,
    version: appInfo?.version ?? "unknown",
    interactions: visibleInteractions,
    channels,
    inboxSources,
    entityTypes: counts.length,
  };
}

/** The status line under the title: health first, then the job queue. */
export function overviewStatusFacts(
  facts: BrainFacts,
): RuntimeStudioOperatorViewFact[] {
  const jobs = facts.activeJobs === 1 ? "job" : "jobs";
  const failed = facts.failedJobs === 1 ? "job" : "jobs";
  return [
    facts.degraded
      ? { label: "Brain degraded", tone: "error" }
      : facts.runtime === "operational"
        ? { label: "Brain running", tone: "good" }
        : { label: "Runtime unavailable", tone: "warn" },
    facts.activeJobs === 0
      ? { label: "Queue idle" }
      : {
          label: `${facts.activeJobs} ${jobs} active`,
          ...(facts.degraded ? { tone: "warn" as const } : {}),
        },
    ...(facts.failedJobs > 0
      ? [
          {
            label: `${facts.failedJobs} failed ${failed}`,
            tone: "warn" as const,
          },
        ]
      : []),
  ];
}

export class StudioOverviewRegistry {
  private readonly contributions = new Map<string, StoredContribution>();
  private activity: OverviewActivity[] = [];
  private readonly now: () => number;
  private readonly store: OverviewActivityStore | undefined;
  private readonly onStoreError: (error: unknown) => void;
  private pending: Promise<unknown> = Promise.resolve();

  constructor(
    options: {
      now?: () => number;
      /** Keeps the feed between runs; without one it lasts as long as the process. */
      store?: OverviewActivityStore | undefined;
      onStoreError?: ((error: unknown) => void) | undefined;
    } = {},
  ) {
    this.now = options.now ?? Date.now;
    this.store = options.store;
    this.onStoreError = options.onStoreError ?? ((): void => {});
  }

  /**
   * Bring back the day's feed from the store, merged under anything recorded
   * since this run began, and forget what is older than a day.
   */
  async restore(): Promise<void> {
    const store = this.store;
    if (!store) return;
    const since = this.now() - ACTIVITY_WINDOW_MS;
    const readAll = async (
      afterKey: string | undefined,
    ): Promise<ReadonlyArray<{ key: string; value: OverviewActivity }>> => {
      const page = await store.list({ afterKey, limit: STORE_PAGE });
      const last = page.at(-1);
      return page.length < STORE_PAGE || !last
        ? page
        : [...page, ...(await readAll(last.key))];
    };
    const stored = await readAll(undefined).catch((error: unknown) => {
      // The feed is informational: an unreadable store starts it empty.
      this.onStoreError(error);
      return [];
    });
    const stale = stored.filter(({ value }) => Date.parse(value.at) < since);
    stale.forEach(({ key }) => this.forget(key));
    const current = new Set(this.activity.map((item) => item.id));
    this.keep(
      [
        ...this.activity,
        ...stored
          .map(({ value }) => value)
          .filter(
            (item) => Date.parse(item.at) >= since && !current.has(item.id),
          ),
      ].sort((left, right) => Date.parse(right.at) - Date.parse(left.at)),
    );
  }

  /** Resolves once every write to the store so far has settled. */
  async settled(): Promise<void> {
    await this.pending;
  }

  private persist(item: OverviewActivity): void {
    if (!this.store) return;
    this.track(this.store.set(item.id, item));
  }

  private forget(key: string): void {
    if (!this.store) return;
    this.track(this.store.delete(key));
  }

  private track(write: Promise<unknown>): void {
    // A feed write never fails the event it records; the failure is reported.
    const settled = write.catch((error: unknown) => this.onStoreError(error));
    this.pending = Promise.all([this.pending, settled]);
  }

  register(input: StudioOverviewContributionRegistration): void {
    const contribution = studioOverviewContributionSchema.parse(input);
    this.contributions.set(
      `${contribution.pluginId}:${contribution.id}`,
      contribution,
    );
  }

  unregister(input: StudioOverviewContributionUnregistration): number {
    if (input.contributionId) {
      return this.contributions.delete(
        `${input.pluginId}:${input.contributionId}`,
      )
        ? 1
        : 0;
    }
    let removed = 0;
    for (const [key, contribution] of this.contributions) {
      if (contribution.pluginId !== input.pluginId) continue;
      this.contributions.delete(key);
      removed += 1;
    }
    return removed;
  }

  async recordEntity(
    action: "created" | "updated" | "deleted",
    change: EntityChangePayload,
    describe: DescribeEntityActivity = describeByType,
  ): Promise<void> {
    const timestamp = new Date(this.now()).toISOString();
    const { title, typeLabel } = await describe(
      change.entityType,
      change.entity,
      change.entityId,
    );
    const next: OverviewActivity = {
      id: boundedId(
        "entity",
        `${timestamp}-${action}-${change.entityType}-${change.entityId}`,
      ),
      at: timestamp,
      title: title ?? change.entityId,
      metadata: [`${typeLabel} ${action}`, timestamp],
      tone:
        action === "deleted"
          ? "warn"
          : action === "created"
            ? "good"
            : "neutral",
      link: {
        kind: "entity",
        entityType: change.entityType,
        id: change.entityId,
      },
    };
    this.keep([next, ...this.activity]);
    this.persist(next);
  }

  recordJob(event: JobProgressEvent): void {
    const timestamp = new Date(this.now()).toISOString();
    const jobType = event.jobDetails?.jobType ?? event.type;
    const progress = event.progress
      ? `${event.progress.current}/${event.progress.total}`
      : undefined;
    const next: OverviewActivity = {
      id: boundedId("job", `${event.type}-${event.id}`),
      at: timestamp,
      title: `${jobName(jobType)} ${event.status}`,
      // A feed line, so a long message is cut rather than shown whole.
      ...(event.message
        ? { description: truncateText(event.message, JOB_MESSAGE_LIMIT) }
        : {}),
      metadata: [JOB_ACTIVITY, timestamp, ...(progress ? [progress] : [])],
      tone:
        event.status === "failed"
          ? "error"
          : event.status === "completed"
            ? "good"
            : "warn",
    };
    this.keep([next, ...this.activity.filter((item) => item.id !== next.id)]);
    this.persist(next);
  }

  /** A day of events, newest first, bounded so a burst cannot grow it unchecked. */
  private keep(activity: readonly OverviewActivity[]): void {
    const since = this.now() - ACTIVITY_WINDOW_MS;
    const kept = activity
      .filter((item) => Date.parse(item.at) >= since)
      .slice(0, MAX_ACTIVITY);
    const keptIds = new Set(kept.map((item) => item.id));
    this.activity
      .filter((item) => !keptIds.has(item.id))
      .forEach((item) => this.forget(item.id));
    this.activity = kept;
  }

  listActivity(): readonly OverviewActivity[] {
    const since = this.now() - ACTIVITY_WINDOW_MS;
    return this.activity.filter((item) => Date.parse(item.at) >= since);
  }

  private list(permission: UserPermissionLevel): StoredContribution[] {
    return [...this.contributions.values()]
      .filter((contribution) => admitted(permission, contribution.visibility))
      .sort(
        (left, right) =>
          left.priority - right.priority ||
          left.pluginId.localeCompare(right.pluginId) ||
          left.id.localeCompare(right.id),
      );
  }

  async load(
    actor: StudioWorkspaceActor,
    signal?: AbortSignal,
  ): Promise<LoadedContribution[]> {
    const requestSignal = signal ?? new AbortController().signal;
    const contributions = this.list(actor.userPermissionLevel);
    return Promise.all(
      contributions.map(async (contribution): Promise<LoadedContribution> => {
        try {
          requestSignal.throwIfAborted();
          const rawData = await contribution.dataProvider({
            caller: {
              actor: { id: actor.userId },
              permission: actor.userPermissionLevel,
              isAnchor: actor.isAnchor,
            },
            signal: requestSignal,
          });
          requestSignal.throwIfAborted();
          const parsed = safeParseRuntimeDashboardWidgetData(rawData);
          if (!parsed.success) throw new Error("Invalid contribution data");
          const digest = derivedDigest(contribution, parsed.data, rawData);
          return {
            contribution,
            data: parsed.data,
            digest: digest.digest,
            attention: digest.attention,
            failed: false,
          };
        } catch (error) {
          if (requestSignal.aborted) throw error;
          return {
            contribution,
            digest: [],
            attention: 1,
            failed: true,
          };
        }
      }),
    );
  }
}

/** Home and History share the overview's sources and its workspace registry. */
interface HomeSourcesInput {
  context: StudioContext;
  registry: StudioOverviewRegistry;
  /** The workspaces that say what needs the person; none in some tests. */
  workspaces?: StudioWorkspaceRegistry | undefined;
}

/** How many things Home lists under "Needs you": the count beside Home. */
async function homeAttentionCount(
  input: HomeSourcesInput,
  actor: StudioWorkspaceActor,
): Promise<number> {
  const [workspaceAttention, loaded] = await Promise.all([
    input.workspaces?.listAttention(actor) ?? [],
    input.registry.load(actor),
  ]);
  const own = input.workspaces?.pluginsWithAttention() ?? new Set<string>();
  return (
    workspaceAttention.reduce((total, entry) => total + entry.items.length, 0) +
    loaded.filter(
      (source) =>
        !own.has(source.contribution.pluginId) &&
        (source.attention > 0 || source.failed),
    ).length +
    input.registry.listActivity().filter((item) => item.tone === "error").length
  );
}

/**
 * Home, the page Studio opens on. Studio draws it from its own route; the
 * workspace places it in Home and counts what needs the person.
 */
export function createStudioHomeWorkspace(
  input: HomeSourcesInput,
): StudioWorkspaceRegistration {
  return {
    id: STUDIO_OVERVIEW_WORKSPACE_ID,
    pluginId: "studio",
    label: "Home",
    rendererName: DECLARATIVE_STUDIO_WORKSPACE_RENDERER,
    priority: -100,
    permission: "trusted",
    section: "home",
    entityTypes: [],
    accessHandler: (actor) => admitted(actor.userPermissionLevel, "trusted"),
    dataProvider: async (): Promise<RuntimeStudioWorkspaceData> => ({
      view: { title: "Home", blocks: [] },
    }),
    badgeProvider: (actor) => homeAttentionCount(input, actor),
  };
}

/** History, under Brain: everything that happened in the last week. */
export function createStudioHistoryWorkspace(
  input: HomeSourcesInput,
): StudioWorkspaceRegistration {
  return {
    id: STUDIO_HISTORY_WORKSPACE_ID,
    pluginId: "studio",
    label: "History",
    rendererName: DECLARATIVE_STUDIO_WORKSPACE_RENDERER,
    // Last among the brain's pages: it is read after the rest.
    priority: 1000,
    permission: "trusted",
    section: "brain",
    entityTypes: [],
    accessHandler: (actor) => admitted(actor.userPermissionLevel, "trusted"),
    dataProvider: async (actor): Promise<RuntimeStudioWorkspaceData> => {
      const facts = await brainFacts(input.context, actor);
      return {
        view: {
          title: "History",
          facts: overviewStatusFacts(facts),
          blocks: [historyCard(input.registry.listActivity())],
        },
        refreshAfterMs: STUDIO_OVERVIEW_REFRESH_MS,
      };
    },
  };
}

/** The title of an entry as stored, when an event did not carry it. */
async function storedTitle(
  context: StudioContext,
  entityType: string,
  entityId: string,
): Promise<string | undefined> {
  // A missing or unreadable entry keeps its id in the feed; activity is
  // informational and must not fail the event it observes.
  // Only its title is read: binary content stays its stored reference.
  const entity = await context.entityService
    .getEntity({ entityType, id: entityId })
    .catch(() => null);
  return entity ? entityDisplayTitle(context, entity) : undefined;
}

/**
 * How the feed names an entry: as the editor and the ⌘K palette do, from the
 * entry the event carries (the prior one for a delete), or by reading it once
 * when a projection's write announced only its id.
 */
export function studioActivityDescriber(
  context: StudioContext,
  getEntityDisplay: () =>
    Partial<Record<string, EntityDisplayLabel>> | undefined = () => undefined,
): DescribeEntityActivity {
  return async (entityType, entity, entityId) => ({
    title: entity
      ? entityDisplayTitle(context, entity)
      : await storedTitle(context, entityType, entityId),
    typeLabel: entityTypeLabels(entityType, getEntityDisplay()?.[entityType])
      .label,
  });
}

export function registerStudioOverviewActivity(
  context: StudioContext,
  listen: ServiceRuntime["listen"],
  registry: StudioOverviewRegistry,
  getEntityDisplay: () =>
    Partial<Record<string, EntityDisplayLabel>> | undefined = () => undefined,
): void {
  const describe = studioActivityDescriber(context, getEntityDisplay);
  // Observed: the feed shows changes from either process, such as the
  // worker syncing content from git.
  const observed = { mode: "observe" } as const;
  listen(
    entityCreatedChannel,
    async ({ payload }) => {
      await registry.recordEntity("created", payload, describe);
    },
    observed,
  );
  listen(
    entityUpdatedChannel,
    async ({ payload }) => {
      await registry.recordEntity("updated", payload, describe);
    },
    observed,
  );
  listen(
    entityDeletedChannel,
    async ({ payload }) => {
      await registry.recordEntity("deleted", payload, describe);
    },
    observed,
  );
  listen(jobProgressChannel, ({ payload }) => {
    registry.recordJob(payload);
  });
}
