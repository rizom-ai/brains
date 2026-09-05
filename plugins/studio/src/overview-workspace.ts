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

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function directLaunchTarget(
  view: RuntimeDashboardOperatorView,
): RuntimeOperatorLinkTarget | undefined {
  for (const block of view.blocks) {
    if (block.type !== "links") continue;
    const target = block.items.find(
      (item) => item.target.kind === "launch",
    )?.target;
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
        : `${loaded.attention} items need attention.`),
    metadata: [
      titleCase(loaded.contribution.group),
      loaded.failed
        ? "source unavailable"
        : `${loaded.attention} need attention`,
    ],
    tone: loaded.failed ? "error" : "warn",
    ...(link ? { link } : {}),
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
    tone: loaded.failed ? "error" : loaded.attention > 0 ? "warn" : "neutral",
    blocks: sourcePanelBlocks(loaded.data),
  };
}

function activityCard(
  activity: readonly OverviewActivity[],
): RuntimeStudioOperatorCardBlock | undefined {
  if (activity.length === 0) return undefined;
  return {
    type: "card",
    id: "overview-activity",
    label: "While you were away",
    blocks: [
      {
        type: "list",
        id: "overview-activity-list",
        empty: "No recent autonomous activity.",
        items: activity.map((item) => ({
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

async function runtimeCards(
  context: ServicePluginContext,
  actor: StudioWorkspaceActor,
  sourceCount: number,
): Promise<readonly RuntimeStudioOperatorCardBlock[]> {
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
  const systemTone =
    readiness?.operationalStatus === "degraded" || failed > 0
      ? "warn"
      : "neutral";
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

  return [
    {
      type: "card",
      id: "overview-system",
      label: "System",
      tone: systemTone,
      blocks: [
        {
          type: "key-values",
          items: [
            {
              label: "Runtime",
              value: readiness?.operationalStatus ?? "unavailable",
            },
            {
              label: "Jobs",
              value:
                pending + processing === 0
                  ? "idle"
                  : `${pending + processing} active`,
            },
            { label: "Queue", value: `${pending} waiting` },
            { label: "Failed", value: failed },
            { label: "Version", value: appInfo?.version ?? "unknown" },
          ],
        },
      ],
    },
    {
      type: "card",
      id: "overview-network",
      label: "Network",
      tone: "neutral",
      blocks: [
        {
          type: "key-values",
          items: [
            { label: "Interactions", value: visibleInteractions },
            { label: "Channels", value: channels },
            { label: "Inbox sources", value: inboxSources },
            { label: "Operational sources", value: sourceCount },
            { label: "Entity types", value: counts.length },
          ],
        },
      ],
    },
  ];
}

export class StudioOverviewRegistry {
  private readonly contributions = new Map<string, StoredContribution>();
  private activity: OverviewActivity[] = [];

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

  recordEntity(
    action: "created" | "updated" | "deleted",
    payload: unknown,
  ): void {
    const parsed = entityActivityPayloadSchema.safeParse(payload);
    if (!parsed.success) return;
    const timestamp = new Date().toISOString();
    const next: OverviewActivity = {
      id: boundedId(
        "entity",
        `${timestamp}-${action}-${parsed.data.entityType}-${parsed.data.entityId}`,
      ),
      title: `${parsed.data.entityType}/${parsed.data.entityId} ${action}`,
      metadata: ["Entity activity", timestamp],
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
    this.activity = [next, ...this.activity].slice(0, 12);
  }

  recordJob(payload: unknown): void {
    const parsed = jobProgressPayloadSchema.safeParse(payload);
    if (!parsed.success) return;
    const timestamp = new Date().toISOString();
    const jobType = parsed.data.jobDetails?.jobType ?? parsed.data.type;
    const progress = parsed.data.progress
      ? `${parsed.data.progress.current}/${parsed.data.progress.total}`
      : undefined;
    const next: OverviewActivity = {
      id: boundedId("job", `${parsed.data.type}-${parsed.data.id}`),
      title: `${jobType} ${parsed.data.status}`,
      ...(parsed.data.message ? { description: parsed.data.message } : {}),
      metadata: ["Job activity", timestamp, ...(progress ? [progress] : [])],
      tone:
        parsed.data.status === "failed"
          ? "error"
          : parsed.data.status === "completed"
            ? "good"
            : "warn",
    };
    this.activity = [
      next,
      ...this.activity.filter((item) => item.id !== next.id),
    ].slice(0, 12);
  }

  listActivity(): readonly OverviewActivity[] {
    return this.activity;
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

function overviewView(
  loaded: readonly LoadedContribution[],
  activity: readonly OverviewActivity[],
  runtime: readonly RuntimeStudioOperatorCardBlock[],
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
  const attentionItems = [
    ...loaded.flatMap((source) => {
      const item = attentionItem(source);
      return item ? [item] : [];
    }),
    ...failedAttentionItems,
  ];
  const attentionCard: RuntimeStudioOperatorCardBlock = {
    type: "card",
    id: "overview-attention",
    label: "Needs attention",
    tone: attention > 0 ? "warn" : "good",
    blocks: [
      {
        type: "list",
        id: "overview-attention-list",
        empty: "Nothing needs your attention.",
        items: attentionItems,
      },
    ],
  };
  const recentActivity = activityCard(activity);
  const primarySources = loaded
    .filter((source) => source.contribution.section !== "sidebar")
    .map(sourceCard);
  const sidebarSources = loaded
    .filter((source) => source.contribution.section === "sidebar")
    .map(sourceCard);
  const view: RuntimeStudioOperatorView = {
    kicker: "Operator home",
    title: "Overview",
    description:
      "What needs you, and what the brain did on its own. Glance here, act in the workspace that owns it.",
    status: {
      label: attention === 1 ? "1 needs you" : `${attention} need you`,
      tone: attention > 0 ? "warn" : "good",
    },
    blocks: [
      {
        type: "columns",
        id: "overview-columns",
        primary: [
          attentionCard,
          ...(recentActivity ? [recentActivity] : []),
          ...primarySources,
        ],
        aside: [...runtime, ...sidebarSources],
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
      const runtime = await runtimeCards(input.context, actor, loaded.length);
      return {
        view: overviewView(loaded, input.registry.listActivity(), runtime),
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

export function registerStudioOverviewActivity(
  context: ServicePluginContext,
  registry: StudioOverviewRegistry,
): void {
  context.messaging.subscribe(ENTITY_CHANNELS.created, (message) => {
    registry.recordEntity("created", message.payload);
    return { success: true };
  });
  context.messaging.subscribe(ENTITY_CHANNELS.updated, (message) => {
    registry.recordEntity("updated", message.payload);
    return { success: true };
  });
  context.messaging.subscribe(ENTITY_CHANNELS.deleted, (message) => {
    registry.recordEntity("deleted", message.payload);
    return { success: true };
  });
  context.messaging.subscribe(JOB_CHANNELS.progress, (message) => {
    registry.recordJob(message.payload);
    return { success: true };
  });
}
