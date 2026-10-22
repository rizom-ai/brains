import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  DECLARATIVE_STUDIO_WORKSPACE_RENDERER,
  PermissionService,
  safeParseRuntimeDashboardWidgetData,
  type DashboardWidgetProviderContext,
  type DashboardWidgetRegistration,
  type RuntimeDashboardOperatorView,
  type RuntimeDashboardWidgetData,
  type RuntimeOperatorLinkTarget,
  type RuntimeStudioOperatorCardBlock,
  type RuntimeStudioOperatorPanelBlock,
  type RuntimeStudioOperatorView,
  type RuntimeStudioWorkspaceData,
  type ServicePluginContext,
  type StudioOverviewContributionRegistration,
  type StudioOverviewContributionUnregistration,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
  type UserPermissionLevel,
} from "@brains/plugins";
import { ENTITY_CHANNELS, JOB_CHANNELS } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { isRecord } from "@brains/utils/is-record";
import { displayTitleFrom } from "@brains/utils/string-utils";
import { entityDisplayTitle } from "./editor-entities";
import { entityTypeLabels, type EntityDisplayLabel } from "./config";
import {
  STUDIO_OVERVIEW_REFRESH_MS,
  STUDIO_OVERVIEW_WORKSPACE_ID,
} from "./overview-constants";

export {
  STUDIO_OVERVIEW_REFRESH_MS,
  STUDIO_OVERVIEW_WORKSPACE_ID,
} from "./overview-constants";

type DashboardDigestLine = NonNullable<
  DashboardWidgetRegistration["digest"]
>[number];
type RuntimeStudioOperatorListItem = Extract<
  RuntimeStudioOperatorPanelBlock,
  { type: "list" }
>["items"][number];

type ContributionDataProvider = (
  context: DashboardWidgetProviderContext,
) => Promise<unknown>;
type ContributionDigestProvider = NonNullable<
  DashboardWidgetRegistration["digestProvider"]
>;

const contributionSchema: z.ZodObject<
  {
    id: z.ZodString;
    pluginId: z.ZodString;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    group: z.ZodString;
    rendererName: z.ZodLiteral<typeof DECLARATIVE_DASHBOARD_WIDGET_RENDERER>;
    priority: z.ZodDefault<z.ZodNumber>;
    section: z.ZodDefault<
      z.ZodEnum<{
        primary: "primary";
        secondary: "secondary";
        sidebar: "sidebar";
      }>
    >;
    visibility: z.ZodEnum<{ trusted: "trusted"; admin: "admin" }>;
    needsAttention: z.ZodOptional<z.ZodNumber>;
    digest: z.ZodOptional<
      z.ZodArray<
        z.ZodObject<{
          label: z.ZodString;
          value: z.ZodString;
          tone: z.ZodOptional<
            z.ZodEnum<{ plain: "plain"; good: "good"; warn: "warn" }>
          >;
        }>
      >
    >;
    dataProvider: z.ZodCustom<
      ContributionDataProvider,
      ContributionDataProvider
    >;
    digestProvider: z.ZodOptional<
      z.ZodCustom<ContributionDigestProvider, ContributionDigestProvider>
    >;
  },
  z.core.$strict
> = z
  .object({
    id: z.string().trim().min(1).max(120),
    pluginId: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(160),
    description: z.string().max(500).optional(),
    group: z.string().trim().min(1).max(120),
    rendererName: z.literal(DECLARATIVE_DASHBOARD_WIDGET_RENDERER),
    priority: z.number().int().default(50),
    section: z.enum(["primary", "secondary", "sidebar"]).default("primary"),
    visibility: z.enum(["trusted", "admin"]),
    needsAttention: z.number().int().nonnegative().optional(),
    digest: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(160),
          value: z.string().max(500),
          tone: z.enum(["plain", "good", "warn"]).optional(),
        }),
      )
      .max(4)
      .optional(),
    dataProvider: z.custom<ContributionDataProvider>(
      (value) => typeof value === "function",
      { message: "Expected Overview contribution data provider function" },
    ),
    digestProvider: z
      .custom<ContributionDigestProvider>(
        (value) => typeof value === "function",
        {
          message: "Expected Overview contribution digest provider function",
        },
      )
      .optional(),
  })
  .strict();

type StoredContribution = z.output<typeof contributionSchema>;

/** Registrations arrive typed by the plugin contract; the schema must accept every one. */
function expectContributionInput(
  value: StudioOverviewContributionRegistration,
): z.input<typeof contributionSchema> {
  return value;
}
void expectContributionInput;

const entityActivityPayloadSchema = z.object({
  entityType: z.string().trim().min(1).max(120),
  entityId: z.string().trim().min(1).max(300),
  entity: z.looseObject({}).optional(),
});

/** How the activity feed names an entry and its type. */
export type DescribeEntityActivity = (
  entityType: string,
  entity: Record<string, unknown> | undefined,
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

const jobProgressPayloadSchema = z.object({
  id: z.string().trim().min(1).max(300),
  type: z.enum(["job", "batch"]),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  message: z.string().max(500).optional(),
  progress: z
    .object({
      current: z.number(),
      total: z.number(),
      percentage: z.number(),
    })
    .optional(),
  jobDetails: z
    .object({
      jobType: z.string().trim().min(1).max(160),
      priority: z.number(),
      retryCount: z.number(),
    })
    .optional(),
});

interface OverviewActivity {
  readonly id: string;
  /** When the event happened, as an ISO timestamp. */
  readonly at: string;
  readonly title: string;
  readonly description?: string | undefined;
  readonly metadata: readonly string[];
  readonly tone: "good" | "warn" | "neutral" | "error";
  readonly link?: RuntimeOperatorLinkTarget | undefined;
}

interface LoadedContribution {
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

const ACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_ACTIVITY = 200;

/** "site:build" reads as "Site build". */
function jobName(jobType: string): string {
  const words = jobType
    .split(/[-_:.\s]+/)
    .filter(Boolean)
    .join(" ");
  return `${words.slice(0, 1).toUpperCase()}${words.slice(1)}`;
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function directLaunchTarget(
  view: RuntimeDashboardOperatorView,
): { label: string; target: RuntimeOperatorLinkTarget } | undefined {
  for (const block of view.blocks) {
    if (block.type !== "links") continue;
    const target = block.items.find((item) => item.target.kind === "launch");
    if (target) return target;
  }
  return undefined;
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

function attentionItem(
  loaded: LoadedContribution,
): RuntimeStudioOperatorListItem | undefined {
  if (loaded.attention === 0 && !loaded.failed) return undefined;
  const warning = loaded.digest
    .filter((line) => line.tone === "warn")
    .map((line) => `${line.label}: ${line.value}`)
    .join(" · ");
  const link = loaded.data ? directLaunchTarget(loaded.data.view) : undefined;
  return {
    id: boundedId(
      "attention",
      `${loaded.contribution.pluginId}-${loaded.contribution.id}`,
    ),
    title: loaded.contribution.title,
    description:
      warning ||
      (loaded.failed
        ? "This source is temporarily unavailable."
        : `${loaded.attention} ${loaded.attention === 1 ? "item needs" : "items need"} attention.`),
    metadata: [
      titleCase(loaded.contribution.group),
      loaded.failed
        ? "source unavailable"
        : `${loaded.attention} ${loaded.attention === 1 ? "item" : "items"}`,
    ],
    tone: loaded.failed ? "error" : "warn",
    ...(link ? { links: [link] } : {}),
  };
}

function sourcePanelBlocks(
  data: RuntimeDashboardWidgetData | undefined,
): readonly RuntimeStudioOperatorPanelBlock[] {
  if (!data) {
    return [
      {
        type: "notice",
        tone: "error",
        text: "This operational source is temporarily unavailable.",
      },
    ];
  }
  return data.view.blocks.flatMap((block) =>
    block.type === "tabs"
      ? (block.tabs.find((tab) => tab.id === block.defaultTab)?.blocks ?? [])
      : [block],
  );
}

function sourceCard(
  loaded: LoadedContribution,
): RuntimeStudioOperatorCardBlock {
  return {
    type: "card",
    id: boundedId(
      "source",
      `${loaded.contribution.pluginId}-${loaded.contribution.id}`,
    ),
    label: loaded.contribution.title,
    presentation: "disclosure",
    tone: loaded.failed ? "error" : "neutral",
    blocks: sourcePanelBlocks(loaded.data),
  };
}

function activityCard(
  activity: readonly OverviewActivity[],
): RuntimeStudioOperatorCardBlock {
  return {
    type: "card",
    id: "overview-activity",
    label: "What happened",
    blocks: [
      {
        type: "list",
        id: "overview-activity-list",
        presentation: "activity",
        empty: "Nothing happened in the last 24 hours.",
        // Failures are listed in Needs you; repeating them here adds nothing.
        items: activity
          .filter((item) => item.tone !== "error")
          .map((item) => ({
            id: item.id,
            title: item.title,
            ...(item.description ? { description: item.description } : {}),
            metadata: item.metadata,
            tone: item.tone,
            ...(item.link ? { link: item.link } : {}),
          })),
      },
    ],
  };
}

/** Standing facts about the brain itself, read once per Overview load. */
interface BrainFacts {
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

async function brainFacts(
  context: ServicePluginContext,
  actor: StudioWorkspaceActor,
): Promise<BrainFacts> {
  const [appInfoResult, readinessResult, countsResult] =
    await Promise.allSettled([
      context.appInfo(),
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
      PermissionService.hasPermission(
        actor.userPermissionLevel,
        interaction.visibility,
      ),
    ).length ?? 0;
  let channels = 0;
  let inboxSources = 0;
  try {
    channels = context.channels.listDescriptors().length;
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

function brainCard(facts: BrainFacts): RuntimeStudioOperatorCardBlock {
  return {
    type: "card",
    id: "overview-brain",
    label: "Brain",
    tone: facts.degraded || facts.failedJobs > 0 ? "warn" : "neutral",
    blocks: [
      {
        type: "key-values",
        items: [
          { label: "Runtime", value: facts.runtime },
          {
            label: "Jobs",
            value:
              facts.activeJobs === 0 ? "idle" : `${facts.activeJobs} active`,
          },
          { label: "Failed jobs", value: facts.failedJobs },
          { label: "Version", value: facts.version },
          { label: "Interactions", value: facts.interactions },
          { label: "Channels", value: facts.channels },
          { label: "Inbox sources", value: facts.inboxSources },
          { label: "Entity types", value: facts.entityTypes },
        ],
      },
    ],
  };
}

export class StudioOverviewRegistry {
  private readonly contributions = new Map<string, StoredContribution>();
  private activity: OverviewActivity[] = [];
  private readonly now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
  }

  register(input: StudioOverviewContributionRegistration): void {
    const contribution = contributionSchema.parse(input);
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
    payload: unknown,
    describe: DescribeEntityActivity = describeByType,
  ): Promise<void> {
    const parsed = entityActivityPayloadSchema.safeParse(payload);
    if (!parsed.success) return;
    const timestamp = new Date(this.now()).toISOString();
    const { title, typeLabel } = await describe(
      parsed.data.entityType,
      parsed.data.entity,
      parsed.data.entityId,
    );
    const next: OverviewActivity = {
      id: boundedId(
        "entity",
        `${timestamp}-${action}-${parsed.data.entityType}-${parsed.data.entityId}`,
      ),
      at: timestamp,
      title: title ?? parsed.data.entityId,
      metadata: [`${typeLabel} ${action}`, timestamp],
      tone:
        action === "deleted"
          ? "warn"
          : action === "created"
            ? "good"
            : "neutral",
      link: {
        kind: "entity",
        entityType: parsed.data.entityType,
        id: parsed.data.entityId,
      },
    };
    this.keep([next, ...this.activity]);
  }

  recordJob(payload: unknown): void {
    const parsed = jobProgressPayloadSchema.safeParse(payload);
    if (!parsed.success) return;
    const timestamp = new Date(this.now()).toISOString();
    const jobType = parsed.data.jobDetails?.jobType ?? parsed.data.type;
    const progress = parsed.data.progress
      ? `${parsed.data.progress.current}/${parsed.data.progress.total}`
      : undefined;
    const next: OverviewActivity = {
      id: boundedId("job", `${parsed.data.type}-${parsed.data.id}`),
      at: timestamp,
      title: `${jobName(jobType)} ${parsed.data.status}`,
      ...(parsed.data.message ? { description: parsed.data.message } : {}),
      metadata: ["Job activity", timestamp, ...(progress ? [progress] : [])],
      tone:
        parsed.data.status === "failed"
          ? "error"
          : parsed.data.status === "completed"
            ? "good"
            : "warn",
    };
    this.keep([next, ...this.activity.filter((item) => item.id !== next.id)]);
  }

  /** A day of events, newest first, bounded so a burst cannot grow it unchecked. */
  private keep(activity: readonly OverviewActivity[]): void {
    const since = this.now() - ACTIVITY_WINDOW_MS;
    this.activity = activity
      .filter((item) => Date.parse(item.at) >= since)
      .slice(0, MAX_ACTIVITY);
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

const severity: Record<
  NonNullable<RuntimeStudioOperatorListItem["tone"]>,
  number
> = { error: 0, warn: 1, neutral: 2, good: 3 };

function overviewView(
  loaded: readonly LoadedContribution[],
  activity: readonly OverviewActivity[],
  facts: BrainFacts,
): RuntimeStudioOperatorView {
  const failedActivity = activity.filter((item) => item.tone === "error");
  const attention =
    loaded.reduce((total, source) => total + source.attention, 0) +
    failedActivity.length;
  const failedAttentionItems: RuntimeStudioOperatorListItem[] =
    failedActivity.map((item) => ({
      id: boundedId("attention", item.id),
      title: item.title,
      ...(item.description ? { description: item.description } : {}),
      metadata: item.metadata,
      tone: "error",
      ...(item.link ? { link: item.link } : {}),
    }));
  // Failures first, then what waits on the operator; the sort is stable, so
  // sources keep their priority order within a tone.
  const attentionItems = [
    ...loaded.flatMap((source) => {
      const item = attentionItem(source);
      return item ? [item] : [];
    }),
    ...failedAttentionItems,
  ].sort(
    (left, right) =>
      severity[left.tone ?? "neutral"] - severity[right.tone ?? "neutral"],
  );
  const attentionCard: RuntimeStudioOperatorCardBlock = {
    type: "card",
    id: "overview-attention",
    label: "Needs you",
    metadata: attention > 0 ? [`${attention} need attention`] : [],
    blocks: [
      {
        type: "list",
        id: "overview-attention-list",
        presentation: "attention",
        empty: "Nothing needs your attention.",
        items: attentionItems,
      },
    ],
  };
  // Sources read as one ledger beside the work; sidebar ones close it.
  const sources = [
    ...loaded.filter((source) => source.contribution.section !== "sidebar"),
    ...loaded.filter((source) => source.contribution.section === "sidebar"),
  ].map(sourceCard);
  const view: RuntimeStudioOperatorView = {
    kicker: "Operator home",
    title: "Overview",
    blocks: [
      ...(attention === 0 && activity.length === 0
        ? [
            {
              type: "notice" as const,
              id: "overview-at-rest",
              title: "Nothing needs your attention.",
              text: "No recent activity is available.",
            },
          ]
        : []),
      {
        type: "columns",
        id: "overview-columns",
        primary: [
          ...(attention === 0 ? [] : [attentionCard]),
          activityCard(activity),
        ],
        aside: [...sources, brainCard(facts)],
      },
    ],
  };
  return view;
}

export function createStudioOverviewWorkspace(input: {
  context: ServicePluginContext;
  registry: StudioOverviewRegistry;
}): StudioWorkspaceRegistration {
  return {
    id: STUDIO_OVERVIEW_WORKSPACE_ID,
    pluginId: "studio",
    label: "Overview",
    rendererName: DECLARATIVE_STUDIO_WORKSPACE_RENDERER,
    priority: -100,
    permission: "trusted",
    entityTypes: [],
    accessHandler: (actor) => admitted(actor.userPermissionLevel, "trusted"),
    dataProvider: async (
      actor,
      _query,
      signal,
    ): Promise<RuntimeStudioWorkspaceData> => {
      const loaded = await input.registry.load(actor, signal);
      const facts = await brainFacts(input.context, actor);
      return {
        view: overviewView(loaded, input.registry.listActivity(), facts),
        refreshAfterMs: STUDIO_OVERVIEW_REFRESH_MS,
      };
    },
    badgeProvider: async (actor) =>
      (await input.registry.load(actor)).reduce(
        (total, source) => total + source.attention,
        input.registry
          .listActivity()
          .filter((activity) => activity.tone === "error").length,
      ),
  };
}

/** The title of an entry as stored, when an event did not carry it. */
async function storedTitle(
  context: ServicePluginContext,
  entityType: string,
  entityId: string,
): Promise<string | undefined> {
  // A missing or unreadable entry keeps its id in the feed; activity is
  // informational and must not fail the event it observes.
  const entity = await context.entityService
    .getEntity({ entityType, id: entityId })
    .catch(() => null);
  return entity ? entityDisplayTitle(context, entity) : undefined;
}

export function registerStudioOverviewActivity(
  context: ServicePluginContext,
  registry: StudioOverviewRegistry,
  getEntityDisplay: () =>
    Partial<Record<string, EntityDisplayLabel>> | undefined = () => undefined,
): void {
  const describe: DescribeEntityActivity = async (
    entityType,
    entity,
    entityId,
  ) => ({
    title:
      entity && isRecord(entity["metadata"])
        ? displayTitleFrom(entity["metadata"])
        : // A projection's write announces only the id; read the entry once.
          await storedTitle(context, entityType, entityId),
    typeLabel: entityTypeLabels(entityType, getEntityDisplay()?.[entityType])
      .label,
  });
  // Observed: the feed shows changes from either process, such as the
  // worker syncing content from git.
  context.messaging.observe(ENTITY_CHANNELS.created, async (message) => {
    await registry.recordEntity("created", message.payload, describe);
    return { success: true };
  });
  context.messaging.observe(ENTITY_CHANNELS.updated, async (message) => {
    await registry.recordEntity("updated", message.payload, describe);
    return { success: true };
  });
  context.messaging.observe(ENTITY_CHANNELS.deleted, async (message) => {
    await registry.recordEntity("deleted", message.payload, describe);
    return { success: true };
  });
  context.messaging.subscribe(JOB_CHANNELS.progress, (message) => {
    registry.recordJob(message.payload);
    return { success: true };
  });
}
