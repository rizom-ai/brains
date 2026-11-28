import type { Plugin } from "@brains/plugins";
import { authServiceOf, authServicePlugin } from "@brains/auth-service";
import { createTestEntity } from "@brains/entity-service/test";
import { ENTITY_CHANNELS, JOB_CHANNELS } from "@brains/contracts";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  createServicePluginContext,
  studioOverviewContributionRegisterContract,
  studioOverviewContributionUnregisterContract,
  studioWorkspaceRegisterContract,
  studioWorkspaceUnregisterContract,
  type DashboardWidgetProviderContext,
  type JobProgressEvent,
  type RuntimeStudioOperatorCardBlock,
  type RuntimeStudioWorkspaceData,
  type StudioOverviewContributionRegistration,
  type StudioWorkspaceRegistration,
  type StudioWorkspaceActor,
  type WebRouteDefinition,
} from "@brains/plugins";
import {
  createMockShell,
  createTempDataDir,
  type MockShell,
} from "@brains/plugins/test";

import { afterEach, describe, expect, it } from "bun:test";
import { isRecord } from "@brains/utils/is-record";
import {
  studioPlugin,
  type StudioPlugin,
  studioContextOn,
} from "./studio-plugins";
import {
  STUDIO_HISTORY_WORKSPACE_ID,
  STUDIO_OVERVIEW_WORKSPACE_ID,
  StudioOverviewRegistry,
  createStudioHistoryWorkspace,
  createStudioHomeWorkspace,
  overviewActivitySchema,
  overviewStatusFacts,
  type OverviewActivity,
} from "../src/overview-workspace";

/** The routing the job queue gives every job it reports on. */
/** History's log: the list block inside its one card. */
type HistoryList = Extract<
  RuntimeStudioOperatorCardBlock["blocks"][number],
  { type: "list" }
>;

const JOB_METADATA: JobProgressEvent["metadata"] = {
  rootJobId: "root-job",
  operationType: "data_processing",
};

it("shows an empty History without hiding the brain's standing state", async () => {
  const registry = new StudioOverviewRegistry();
  const workspace = createStudioHistoryWorkspace({
    context: await studioContextOn(createMockShell()),
    registry,
  });
  const empty = await workspace.dataProvider(admin, {});
  expect(empty).toMatchObject({
    view: {
      title: "History",
      facts: [
        { label: "Brain running", tone: "good" },
        { label: "Queue idle" },
      ],
      blocks: [
        {
          id: "history-activity",
          label: "What happened",
          blocks: [
            {
              type: "list",
              items: [],
              empty: "Nothing has happened in the last week.",
            },
          ],
        },
      ],
    },
  });
  await registry.recordEntity("updated", {
    entityType: "note",
    entityId: "source",
  });
  expect(historyTitles(await workspace.dataProvider(admin, {}))).toEqual([
    "source",
  ]);
});

it("reads a batch of the same change as one line, and repeated saves once", async () => {
  const now = Date.parse("2026-07-11T16:40:00.000Z");
  const registry = new StudioOverviewRegistry({ now: (): number => now });
  for (const id of ["skill-a", "skill-b", "skill-c", "skill-c"])
    await registry.recordEntity("updated", {
      entityType: "skill",
      entityId: id,
    });
  await registry.recordEntity("updated", {
    entityType: "note",
    entityId: "field-log",
  });
  await registry.recordEntity("updated", {
    entityType: "note",
    entityId: "field-log",
  });
  const workspace = createStudioHistoryWorkspace({
    context: await studioContextOn(createMockShell()),
    registry,
  });
  const log = historyList(await workspace.dataProvider(admin, {}));
  expect(
    log.items.map(({ title, description }) => ({ title, description })),
  ).toEqual([
    { title: "field-log", description: undefined },
    {
      title: "skill-c and 2 more",
      description: "skill-c, skill-b, skill-a",
    },
  ]);
});

const admin: StudioWorkspaceActor = {
  interfaceType: "studio",
  userId: "fixture",
  actor: { kind: "user", userId: "fixture" },
  userPermissionLevel: "admin",
  visibilityScope: "restricted",
  isAnchor: false,
};

function isWorkspaceData(value: unknown): value is RuntimeStudioWorkspaceData {
  return (
    isRecord(value) &&
    isRecord(value["view"]) &&
    Array.isArray(value["view"]["blocks"])
  );
}

/** History's log of what happened. */
function historyList(data: unknown): HistoryList {
  if (!isWorkspaceData(data)) throw new Error("History returned no view");
  const card = data.view.blocks.find(
    (block): block is RuntimeStudioOperatorCardBlock =>
      block.type === "card" && block.id === "history-activity",
  );
  const list = card?.blocks[0];
  if (list?.type !== "list") throw new Error("History has no log");
  return list;
}

function historyTitles(data: unknown): string[] {
  return historyList(data).items.map((item) => item.title);
}

describe("Overview composition", () => {
  it("says in the status line when the brain is degraded or jobs failed", () => {
    const facts = {
      runtime: "degraded",
      degraded: true,
      activeJobs: 5,
      failedJobs: 1,
      version: "1.0.0",
      interactions: 0,
      channels: 0,
      inboxSources: 0,
      entityTypes: 0,
    };

    expect(overviewStatusFacts(facts)).toEqual([
      { label: "Brain degraded", tone: "error" },
      { label: "5 jobs active", tone: "warn" },
      { label: "1 failed job", tone: "warn" },
    ]);
    expect(
      overviewStatusFacts({
        ...facts,
        degraded: false,
        runtime: "unavailable",
        activeJobs: 1,
        failedJobs: 2,
      }),
    ).toEqual([
      { label: "Runtime unavailable", tone: "warn" },
      { label: "1 job active" },
      { label: "2 failed jobs", tone: "warn" },
    ]);
  });

  it("counts what needs the person beside Home: each waiting source and each failure once", async () => {
    const registry = new StudioOverviewRegistry();
    registry.register(contribution());
    registry.recordJob({
      id: "preview-build",
      type: "job",
      metadata: JOB_METADATA,
      status: "failed",
      message: "Preview render failed.",
      jobDetails: { jobType: "site-build", priority: 0, retryCount: 0 },
    });
    const workspace = createStudioHomeWorkspace({
      context: await studioContextOn(createMockShell()),
      registry,
    });

    expect(await workspace.badgeProvider?.(admin)).toBe(2);
  });

  it("lists failures in History beside everything else", async () => {
    const registry = new StudioOverviewRegistry();
    await registry.recordEntity("updated", {
      entityType: "note",
      entityId: "quiet-infrastructure",
    });
    registry.recordJob({
      id: "preview-build",
      type: "job",
      metadata: JOB_METADATA,
      status: "failed",
      jobDetails: { jobType: "site-build", priority: 0, retryCount: 0 },
    });
    const workspace = createStudioHistoryWorkspace({
      context: await studioContextOn(createMockShell()),
      registry,
    });

    expect(historyTitles(await workspace.dataProvider(admin, {}))).toEqual([
      "Site build failed",
      "quiet-infrastructure",
    ]);
  });

  it("reads What happened as a timed log without raw timestamps", async () => {
    const now = Date.parse("2026-07-11T16:40:00.000Z");
    const registry = new StudioOverviewRegistry({ now: (): number => now });
    await registry.recordEntity("updated", {
      entityType: "note",
      entityId: "quiet-infrastructure",
    });
    registry.recordJob({
      id: "sync",
      type: "job",
      metadata: JOB_METADATA,
      status: "completed",
      jobDetails: { jobType: "directory-sync", priority: 0, retryCount: 0 },
    });
    const workspace = createStudioHistoryWorkspace({
      context: await studioContextOn(createMockShell()),
      registry,
    });

    const log = historyList(await workspace.dataProvider(admin, {}));

    expect(log.presentation).toBe("log");
    expect(
      log.items.map(({ title, at, metadata }) => ({ title, at, metadata })),
    ).toEqual([
      {
        title: "Directory sync completed",
        at: "2026-07-11T16:40:00.000Z",
        metadata: [],
      },
      {
        title: "quiet-infrastructure",
        at: "2026-07-11T16:40:00.000Z",
        metadata: ["Note updated"],
      },
    ]);
  });

  it("cuts a long job message to a feed line instead of dropping the event", () => {
    const registry = new StudioOverviewRegistry();
    registry.recordJob({
      id: "import-1",
      type: "job",
      metadata: JOB_METADATA,
      status: "failed",
      message: "word ".repeat(200),
    });

    const description = registry.listActivity()[0]?.description ?? "";
    expect(description.length).toBeLessThanOrEqual(500);
    expect(description.endsWith("...")).toBe(true);
  });

  it("names jobs in words rather than by their job type", () => {
    const registry = new StudioOverviewRegistry();
    registry.recordJob({
      id: "dispatch-1",
      type: "job",
      metadata: JOB_METADATA,
      status: "completed",
      jobDetails: {
        jobType: "newsletter:dispatch",
        priority: 0,
        retryCount: 0,
      },
    });

    expect(registry.listActivity()[0]?.title).toBe(
      "Newsletter dispatch completed",
    );
  });

  it("keeps every event of the last week and drops older ones", async () => {
    let now = Date.parse("2026-07-10T12:00:00.000Z");
    const registry = new StudioOverviewRegistry({ now: (): number => now });
    await registry.recordEntity("updated", {
      entityType: "note",
      entityId: "last-month",
    });
    now += 8 * 24 * 60 * 60 * 1000;
    for (const index of Array.from({ length: 30 }, (_, i) => i)) {
      await registry.recordEntity("updated", {
        entityType: "note",
        entityId: `today-${index}`,
      });
    }

    const titles = registry.listActivity().map((item) => item.title);
    expect(titles).toHaveLength(30);
    expect(titles).not.toContain("last-month");
  });

  describe("activity kept between runs", () => {
    /** A runtime-state store as the shell keeps one, in memory. */
    function memoryStore(): {
      records: Map<string, OverviewActivity>;
      set(key: string, value: OverviewActivity): Promise<void>;
      delete(key: string): Promise<boolean>;
      list(options?: {
        readonly afterKey?: string | undefined;
        readonly limit?: number | undefined;
      }): Promise<{ key: string; value: OverviewActivity }[]>;
    } {
      const records = new Map<string, OverviewActivity>();
      return {
        records,
        async set(key, value): Promise<void> {
          records.set(key, overviewActivitySchema.parse(value));
        },
        async delete(key): Promise<boolean> {
          return records.delete(key);
        },
        async list(
          options,
        ): Promise<{ key: string; value: OverviewActivity }[]> {
          return [...records.entries()]
            .sort(([left], [right]) => (left < right ? -1 : 1))
            .filter(([key]) => !options?.afterKey || key > options.afterKey)
            .slice(0, options?.limit ?? 1000)
            .map(([key, value]) => ({ key, value }));
        },
      };
    }

    it("shows the day's activity again after a restart", async () => {
      let at = Date.parse("2026-07-10T12:00:00.000Z");
      const now = (): number => at;
      const store = memoryStore();
      const before = new StudioOverviewRegistry({ now, store });
      await before.recordEntity("created", {
        entityType: "note",
        entityId: "kept-note",
      });
      at += 60_000;
      before.recordJob({
        id: "sync-1",
        type: "job",
        status: "completed",
        jobDetails: { jobType: "directory-sync", priority: 0, retryCount: 0 },
        metadata: JOB_METADATA,
      });
      await before.settled();

      const after = new StudioOverviewRegistry({ now, store });
      await after.restore();
      expect(after.listActivity().map((item) => item.title)).toEqual(
        before.listActivity().map((item) => item.title),
      );
      expect(after.listActivity()).toHaveLength(2);
    });

    it("forgets activity older than a week, in the store too", async () => {
      let now = Date.parse("2026-07-10T12:00:00.000Z");
      const store = memoryStore();
      const before = new StudioOverviewRegistry({
        now: (): number => now,
        store,
      });
      await before.recordEntity("updated", {
        entityType: "note",
        entityId: "old-note",
      });
      now += 8 * 24 * 60 * 60 * 1000;

      const after = new StudioOverviewRegistry({
        now: (): number => now,
        store,
      });
      await after.restore();
      expect(after.listActivity()).toHaveLength(0);
      expect(store.records.size).toBe(0);
    });

    it("never fails the event it observes when the store does", async () => {
      const failures: unknown[] = [];
      const registry = new StudioOverviewRegistry({
        store: {
          set: (): Promise<void> =>
            Promise.reject(new Error("database locked")),
          delete: (): Promise<boolean> =>
            Promise.reject(new Error("database locked")),
          list: (): Promise<never[]> =>
            Promise.reject(new Error("database locked")),
        },
        onStoreError: (error): void => {
          failures.push(error);
        },
      });
      await registry.recordEntity("updated", {
        entityType: "note",
        entityId: "still-shown",
      });
      await registry.restore();
      await registry.settled();
      expect(registry.listActivity().map((item) => item.title)).toEqual([
        "still-shown",
      ]);
      expect(failures.length).toBeGreaterThan(0);
    });
  });
});

it("names entity activity by its title and readable type", async () => {
  const registry = new StudioOverviewRegistry();
  await registry.recordEntity(
    "updated",
    {
      entityType: "post",
      entityId: "resilience-in-distributed-systems",
      entity: createTestEntity("post", {
        id: "resilience-in-distributed-systems",
        metadata: { title: "Resilience Is Not Redundancy" },
      }),
    },
    (entityType, entity) => ({
      title: entity ? "Resilience Is Not Redundancy" : undefined,
      typeLabel: entityType === "post" ? "Post" : entityType,
    }),
  );
  await registry.recordEntity("deleted", {
    entityType: "faq",
    entityId: "gone",
  });

  // A projection's write announces only the id; the entry is read to name it.
  await registry.recordEntity(
    "updated",
    { entityType: "skill", entityId: "design-resilient-systems" },
    async (entityType, entity, entityId) => ({
      title:
        entity === undefined && entityId === "design-resilient-systems"
          ? "Design resilient systems"
          : undefined,
      typeLabel: entityType === "skill" ? "Skill" : entityType,
    }),
  );

  const [derived, deleted, updated] = registry.listActivity();
  expect(derived?.title).toBe("Design resilient systems");
  expect(derived?.metadata[0]).toBe("Skill updated");
  expect(updated?.title).toBe("Resilience Is Not Redundancy");
  expect(updated?.metadata[0]).toBe("Post updated");
  expect(deleted?.title).toBe("gone");
  expect(deleted?.metadata[0]).toBe("FAQ deleted");
});

const authPlugins: Plugin[] = [];

afterEach(async () => {
  for (const plugin of authPlugins.splice(0).reverse()) {
    await plugin.shutdown?.();
  }
});

function findRoute(plugin: StudioPlugin, path: string): WebRouteDefinition {
  const route = plugin
    .getWebRoutes()
    .find((candidate) => candidate.path === path);
  if (!route) throw new Error(`Missing route: ${path}`);
  return route;
}

async function createSession(
  shell: MockShell,
  role: "public" | "trusted" | "admin",
): Promise<string> {
  const auth = authServicePlugin({
    storageDir: await createTempDataDir("brains-studio-overview-auth-"),
  });
  await auth.register(shell);
  authPlugins.push(auth);
  if (role === "admin")
    return (await authServiceOf(shell.getAuthRegistry()).createAuthSession())
      .cookie;
  const user = await authServiceOf(shell.getAuthRegistry()).createUser({
    displayName: `${role} operator`,
    role,
    status: "active",
  });
  return (
    await authServiceOf(shell.getAuthRegistry()).createAuthSession(user.userId)
  ).cookie;
}

function request(path: string, cookie: string): Request {
  return new Request(`https://brain.test${path}`, {
    headers: { Cookie: cookie },
  });
}

function contribution(
  overrides: Partial<StudioOverviewContributionRegistration> = {},
): StudioOverviewContributionRegistration {
  return {
    id: "publication-pipeline",
    pluginId: "content-pipeline",
    title: "Publication Pipeline",
    description: "Publication queue and failures",
    group: "publishing",
    rendererName: DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
    section: "primary",
    priority: 20,
    visibility: "trusted",
    dataProvider: async () => ({
      view: {
        blocks: [
          {
            type: "stats",
            items: [
              { label: "Queued", value: 1 },
              { label: "Failed", value: 2, tone: "warn" },
            ],
          },
          {
            type: "links",
            items: [
              {
                label: "Open publishing",
                target: { kind: "launch", launch: { target: "publishing" } },
              },
            ],
          },
        ],
      },
      digest: {
        items: [
          { label: "Awaiting review", value: "3 drafts", tone: "warn" },
          { label: "Failed", value: "2", tone: "warn" },
        ],
        attention: 2,
      },
    }),
    ...overrides,
  };
}

async function registerContribution(
  shell: MockShell,
  registration: StudioOverviewContributionRegistration,
): Promise<unknown> {
  return shell.getMessageBus().send({
    type: studioOverviewContributionRegisterContract.name,
    sender: registration.pluginId,
    payload: registration,
  });
}

describe("Studio Overview workspace", () => {
  it("admits Trusted sessions, counts what needs them, and composes Home", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const cookie = await createSession(shell, "trusted");
    const plugin = studioPlugin();
    await plugin.register(shell);
    const providerContexts: DashboardWidgetProviderContext[] = [];

    expect(
      await registerContribution(
        shell,
        contribution({
          dataProvider: async (context) => {
            providerContexts.push(context);
            return contribution().dataProvider(context);
          },
        }),
      ),
    ).toMatchObject({ success: true });

    const navigation = await findRoute(plugin, "/studio/api/types").handler(
      request("/studio/api/types", cookie),
    );
    expect(navigation.status).toBe(200);
    expect(await navigation.json()).toMatchObject({
      workspaces: [
        { id: STUDIO_OVERVIEW_WORKSPACE_ID, label: "Home", badge: 1 },
        { id: "studio:account", label: "Account" },
        { id: STUDIO_HISTORY_WORKSPACE_ID, label: "History", section: "brain" },
      ],
    });

    const response = await findRoute(plugin, "/studio/api/home").handler(
      request("/studio/api/home", cookie),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      needsYou: [
        {
          id: "content-pipeline:publication-pipeline",
          title: "Publication Pipeline",
          detail: "Awaiting review: 3 drafts · Failed: 2",
          severity: "warn",
        },
      ],
      drafts: [],
      published: [],
      status: { tone: "good", text: "Brain running." },
    });
    expect(providerContexts.length).toBeGreaterThanOrEqual(2);
    expect(providerContexts[0]).toMatchObject({
      caller: {
        permission: "trusted",
        isAnchor: false,
      },
      signal: expect.any(AbortSignal),
    });
  });

  it("keeps Public sessions on Account and never invokes Overview providers", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const cookie = await createSession(shell, "public");
    const plugin = studioPlugin();
    await plugin.register(shell);
    let providerCalls = 0;
    await registerContribution(
      shell,
      contribution({
        dataProvider: async () => {
          providerCalls += 1;
          return { view: { blocks: [] } };
        },
      }),
    );

    const response = await findRoute(plugin, "/studio/api/types").handler(
      request("/studio/api/types", cookie),
    );

    expect(await response.json()).toMatchObject({
      types: [],
      workspaces: [{ id: "studio:account" }],
    });
    expect(providerCalls).toBe(0);
  });

  it("omits Admin contributions and callbacks from Trusted actors", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const cookie = await createSession(shell, "trusted");
    const plugin = studioPlugin();
    await plugin.register(shell);
    let adminProviderCalls = 0;
    await registerContribution(
      shell,
      contribution({
        id: "admin-health",
        pluginId: "admin-health",
        visibility: "admin",
        dataProvider: async () => {
          adminProviderCalls += 1;
          return { view: { blocks: [] } };
        },
      }),
    );

    const response = await findRoute(plugin, "/studio/api/home").handler(
      request("/studio/api/home", cookie),
    );

    expect(response.status).toBe(200);
    expect(adminProviderCalls).toBe(0);
    expect(JSON.stringify(await response.json())).not.toContain("admin-health");
  });

  it("builds the delta feed from entity and job events", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const cookie = await createSession(shell, "trusted");
    const plugin = studioPlugin();
    await plugin.register(shell);
    await shell.getMessageBus().send({
      type: ENTITY_CHANNELS.updated,
      sender: "test",
      payload: { entityType: "note", entityId: "field-log" },
    });
    await shell.getMessageBus().send({
      type: JOB_CHANNELS.progress,
      sender: "test",
      payload: {
        id: "build-1",
        type: "job",
        metadata: JOB_METADATA,
        status: "completed",
        message: "Preview built",
        jobDetails: { jobType: "site:build", priority: 0, retryCount: 0 },
      },
    });
    await shell.getMessageBus().send({
      type: JOB_CHANNELS.progress,
      sender: "test",
      payload: {
        id: "dispatch-1",
        type: "job",
        metadata: JOB_METADATA,
        status: "failed",
        message: "Transport rejected the payload",
        jobDetails: {
          jobType: "newsletter:dispatch",
          priority: 0,
          retryCount: 2,
        },
      },
    });

    const navigation = await findRoute(plugin, "/studio/api/types").handler(
      request("/studio/api/types", cookie),
    );
    expect(await navigation.json()).toMatchObject({
      workspaces: [
        { id: STUDIO_OVERVIEW_WORKSPACE_ID, badge: 1 },
        { id: "studio:account" },
        { id: STUDIO_HISTORY_WORKSPACE_ID },
      ],
    });

    const response = await findRoute(plugin, "/studio/api/workspace").handler(
      request(
        `/studio/api/workspace?id=${encodeURIComponent(STUDIO_HISTORY_WORKSPACE_ID)}`,
        cookie,
      ),
    );
    const payload = JSON.stringify(await response.json());

    expect(payload).toContain("What happened");
    expect(payload).toContain('"presentation":"log"');
    expect(payload).toContain("Site build completed");
    expect(payload).toContain("Newsletter dispatch failed");
    expect(payload).toContain("Transport rejected the payload");
    expect(payload).toContain('"title":"field-log"');
    expect(payload).toContain("Note updated");
  });

  it("shows the entity changes the other process made, such as a git sync", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const cookie = await createSession(shell, "trusted");
    const plugin = studioPlugin();
    await plugin.register(shell);

    await shell.getMessageBus().deliverPeer(ENTITY_CHANNELS.created, {
      entityType: "note",
      entityId: "synced-from-git",
    });

    const response = await findRoute(plugin, "/studio/api/workspace").handler(
      request(
        `/studio/api/workspace?id=${encodeURIComponent(STUDIO_HISTORY_WORKSPACE_ID)}`,
        cookie,
      ),
    );
    const synced = JSON.stringify(await response.json());
    expect(synced).toContain('"title":"synced-from-git"');
    expect(synced).toContain("Note created");
  });

  it("unregisters re-homed contributions and reserves the Home id", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const cookie = await createSession(shell, "trusted");
    const plugin = studioPlugin();
    await plugin.register(shell);
    await registerContribution(shell, contribution());

    expect(
      await shell.getMessageBus().send({
        type: studioOverviewContributionUnregisterContract.name,
        sender: "content-pipeline",
        payload: {
          pluginId: "content-pipeline",
          contributionId: "publication-pipeline",
        },
      }),
    ).toMatchObject({ success: true });

    await shell.getMessageBus().send({
      type: studioWorkspaceUnregisterContract.name,
      sender: "external",
      payload: { pluginId: "studio" },
    });
    const navigation = await findRoute(plugin, "/studio/api/types").handler(
      request("/studio/api/types", cookie),
    );
    expect(await navigation.json()).toMatchObject({
      workspaces: [
        { id: STUDIO_OVERVIEW_WORKSPACE_ID },
        { id: "studio:account" },
        { id: STUDIO_HISTORY_WORKSPACE_ID },
      ],
    });

    const external: StudioWorkspaceRegistration = {
      id: STUDIO_OVERVIEW_WORKSPACE_ID,
      pluginId: "external",
      label: "Imposter Overview",
      rendererName: "DeclarativeOperatorWorkspace",
      priority: -100,
      permission: "public",
      accessHandler: () => true,
      dataProvider: async () => ({}),
    };
    expect(
      await shell.getMessageBus().send({
        type: studioWorkspaceRegisterContract.name,
        sender: "external",
        payload: external,
      }),
    ).toMatchObject({
      success: false,
      error: expect.stringContaining("reserved by the host"),
    });
  });
});

describe("Dashboard namespace on the Overview contracts", () => {
  it("answers the contribution contracts as their one owner", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    await studioPlugin().register(shell);
    const imposter = createServicePluginContext(shell, "imposter");

    expect(() =>
      imposter.messaging.answer(
        studioOverviewContributionRegisterContract,
        async () => undefined,
      ),
    ).toThrow("already has an owner");
    expect(() =>
      imposter.messaging.answer(
        studioOverviewContributionUnregisterContract,
        async () => undefined,
      ),
    ).toThrow("already has an owner");
  });

  it("re-homes a non-public semantic widget into Overview and withdraws it", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const cookie = await createSession(shell, "trusted");
    const plugin = studioPlugin();
    await plugin.register(shell);
    const context = createServicePluginContext(shell, "content-pipeline");
    const { pluginId: _pluginId, ...widget } = contribution();
    const badge = async (): Promise<unknown> => {
      const navigation = await findRoute(plugin, "/studio/api/types").handler(
        request("/studio/api/types", cookie),
      );
      const body: unknown = await navigation.json();
      if (!isRecord(body) || !Array.isArray(body["workspaces"])) return null;
      const overview: unknown = body["workspaces"][0];
      return isRecord(overview) ? overview["badge"] : null;
    };

    expect(context.dashboard.isAvailable()).toBe(true);
    // Overview draws the semantic view; a widget with its own renderer is refused.
    expect(
      context.dashboard.registerWidget({
        ...widget,
        id: "own-renderer",
        renderer: { component: () => null },
      }),
    ).rejects.toThrow("Unrecognized key");
    expect(await context.dashboard.registerWidget(widget)).toBe(true);
    // One waiting source is one thing that needs the person.
    expect(await badge()).toBe(1);

    expect(
      await context.dashboard.unregisterWidget("publication-pipeline"),
    ).toBe(true);
    expect(await badge()).toBe(0);
  });

  it("keeps a public widget out of Overview", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    await studioPlugin().register(shell);
    const context = createServicePluginContext(shell, "content-pipeline");
    const { pluginId: _pluginId, ...widget } = contribution();

    expect(
      await context.dashboard.registerWidget({
        ...widget,
        visibility: "public",
      }),
    ).toBe(false);
  });
});
