import { AuthServicePlugin } from "@brains/auth-service";
import { ENTITY_CHANNELS, JOB_CHANNELS } from "@brains/contracts";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  createServicePluginContext,
  STUDIO_OVERVIEW_REGISTER_MESSAGE,
  STUDIO_OVERVIEW_UNREGISTER_MESSAGE,
  STUDIO_WORKSPACE_REGISTER_MESSAGE,
  STUDIO_WORKSPACE_UNREGISTER_MESSAGE,
  type DashboardWidgetProviderContext,
  type RuntimeStudioOperatorCardBlock,
  type RuntimeStudioOperatorColumnsBlock,
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
import { studioPlugin, type StudioPlugin } from "../src";
import {
  STUDIO_OVERVIEW_WORKSPACE_ID,
  StudioOverviewRegistry,
  createStudioOverviewWorkspace,
  overviewStatusFacts,
} from "../src/overview-workspace";

it("combines an empty attention/activity state without hiding standing runtime information", async () => {
  const registry = new StudioOverviewRegistry();
  const workspace = createStudioOverviewWorkspace({
    context: createServicePluginContext(createMockShell(), "studio"),
    registry,
  });
  const actor: StudioWorkspaceActor = {
    interfaceType: "studio",
    userId: "fixture",
    actor: { kind: "user", userId: "fixture" },
    userPermissionLevel: "admin",
    visibilityScope: "restricted",
    isAnchor: false,
  };
  const empty = await workspace.dataProvider(actor, {});
  expect(empty).toMatchObject({
    view: {
      title: "Overview",
      facts: [
        { label: "Brain running", tone: "good" },
        { label: "Queue idle" },
      ],
      blocks: [{ type: "columns" }],
    },
  });
  expect(JSON.stringify(empty)).not.toContain('"id":"overview-attention"');
  registry.register(contribution());
  const attentionWithoutActivity = await workspace.dataProvider(actor, {});
  expect(attentionWithoutActivity).toMatchObject({
    view: {
      blocks: [
        {
          type: "columns",
          primary: [
            { id: "overview-attention" },
            {
              id: "overview-activity",
              label: "What happened",
              blocks: [
                {
                  type: "list",
                  items: [],
                  empty: "Nothing happened in the last 24 hours.",
                },
              ],
            },
          ],
          aside: [{ label: "Publication Pipeline" }, { id: "overview-brain" }],
        },
      ],
    },
  });
  await registry.recordEntity("updated", {
    entityType: "note",
    entityId: "source",
  });
  const active = await workspace.dataProvider(actor, {});
  expect(JSON.stringify(active)).toContain('"id":"overview-activity"');
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

function columnsOf(data: unknown): RuntimeStudioOperatorColumnsBlock {
  if (!isWorkspaceData(data)) throw new Error("Overview returned no view");
  const columns = data.view.blocks.find(
    (block): block is RuntimeStudioOperatorColumnsBlock =>
      block.type === "columns",
  );
  if (!columns) throw new Error("Overview has no columns");
  return columns;
}

function cards(
  region: RuntimeStudioOperatorColumnsBlock["primary"],
): RuntimeStudioOperatorCardBlock[] {
  return region.filter(
    (block): block is RuntimeStudioOperatorCardBlock => block.type === "card",
  );
}

function titlesIn(data: unknown, cardId: string): string[] {
  const card = cards(columnsOf(data).primary).find(
    (block) => block.id === cardId,
  );
  const list = card?.blocks[0];
  return list?.type === "list" ? list.items.map((item) => item.title) : [];
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

  it("ranks failures above sources that wait on the operator", async () => {
    const registry = new StudioOverviewRegistry();
    registry.register(contribution());
    registry.recordJob({
      id: "preview-build",
      type: "job",
      status: "failed",
      message: "Preview render failed.",
      jobDetails: { jobType: "site-build", priority: 0, retryCount: 0 },
    });
    const workspace = createStudioOverviewWorkspace({
      context: createServicePluginContext(createMockShell(), "studio"),
      registry,
    });

    const view = await workspace.dataProvider(admin, {});

    expect(titlesIn(view, "overview-attention")).toEqual([
      "Site build failed",
      "Publication Pipeline",
    ]);
  });

  it("leaves failures already in Needs you out of What happened", async () => {
    const registry = new StudioOverviewRegistry();
    await registry.recordEntity("updated", {
      entityType: "note",
      entityId: "quiet-infrastructure",
    });
    registry.recordJob({
      id: "preview-build",
      type: "job",
      status: "failed",
      jobDetails: { jobType: "site-build", priority: 0, retryCount: 0 },
    });
    const workspace = createStudioOverviewWorkspace({
      context: createServicePluginContext(createMockShell(), "studio"),
      registry,
    });

    const view = await workspace.dataProvider(admin, {});

    expect(titlesIn(view, "overview-activity")).toEqual([
      "quiet-infrastructure",
    ]);
  });

  it("names jobs in words rather than by their job type", () => {
    const registry = new StudioOverviewRegistry();
    registry.recordJob({
      id: "dispatch-1",
      type: "job",
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

  it("keeps every event of the last 24 hours and drops older ones", async () => {
    let now = Date.parse("2026-07-10T12:00:00.000Z");
    const registry = new StudioOverviewRegistry({ now: (): number => now });
    await registry.recordEntity("updated", {
      entityType: "note",
      entityId: "yesterday",
    });
    now += 25 * 60 * 60 * 1000;
    for (const index of Array.from({ length: 30 }, (_, i) => i)) {
      await registry.recordEntity("updated", {
        entityType: "note",
        entityId: `today-${index}`,
      });
    }

    const titles = registry.listActivity().map((item) => item.title);
    expect(titles).toHaveLength(30);
    expect(titles).not.toContain("yesterday");
  });

  it("shows each source's own figures on its collapsed row", async () => {
    const registry = new StudioOverviewRegistry();
    registry.register(contribution());
    registry.register(
      contribution({
        id: "action-items",
        pluginId: "conversation-memory",
        title: "Open action items",
        dataProvider: async () => ({
          view: {
            blocks: [
              { type: "list", id: "action-items", empty: "None", items: [] },
            ],
          },
          digest: {
            items: [
              { label: "Open actions", value: "6" },
              { label: "Blocked", value: "1", tone: "warn" },
              { label: "Latest", value: "Confirm the workshop venue" },
            ],
          },
        }),
      }),
    );
    const workspace = createStudioOverviewWorkspace({
      context: createServicePluginContext(createMockShell(), "studio"),
      registry,
    });

    const aside = cards(
      columnsOf(await workspace.dataProvider(admin, {})).aside,
    );

    expect(aside.map((card) => card.summary)).toEqual([
      [
        { label: "Queued", value: 1 },
        { label: "Failed", value: 2, tone: "warn" },
      ],
      [
        { label: "Open actions", value: "6" },
        { label: "Blocked", value: "1", tone: "warn" },
      ],
      undefined,
    ]);
  });

  it("stacks every source beside the work above standing brain facts", async () => {
    const registry = new StudioOverviewRegistry();
    registry.register(contribution());
    registry.register(
      contribution({
        id: "site-health",
        pluginId: "site-builder",
        title: "Site health",
        section: "sidebar",
      }),
    );
    const workspace = createStudioOverviewWorkspace({
      context: createServicePluginContext(createMockShell(), "studio"),
      registry,
    });

    const columns = columnsOf(await workspace.dataProvider(admin, {}));

    expect(cards(columns.primary).map((block) => block.id)).toEqual([
      "overview-attention",
      "overview-activity",
    ]);
    const aside = cards(columns.aside);
    expect(aside.map((block) => block.label)).toEqual([
      "Publication Pipeline",
      "Site health",
      "Brain",
    ]);
    const brain = aside.at(-1);
    if (!brain) throw new Error("Overview has no Brain card");
    expect(brain.presentation).toBeUndefined();
    const facts = brain.blocks[0];
    expect(
      facts?.type === "key-values" ? facts.items.map((item) => item.label) : [],
    ).toEqual([
      "Runtime",
      "Jobs",
      "Failed jobs",
      "Version",
      "Interactions",
      "Channels",
      "Inbox sources",
      "Entity types",
    ]);
  });
});

it("names entity activity by its title and readable type", async () => {
  const registry = new StudioOverviewRegistry();
  await registry.recordEntity(
    "updated",
    {
      entityType: "post",
      entityId: "resilience-in-distributed-systems",
      entity: { metadata: { title: "Resilience Is Not Redundancy" } },
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

const authPlugins: AuthServicePlugin[] = [];

afterEach(async () => {
  for (const plugin of authPlugins.splice(0).reverse()) {
    await plugin.shutdown();
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
  const auth = new AuthServicePlugin({
    storageDir: await createTempDataDir("brains-studio-overview-auth-"),
  });
  await auth.register(shell);
  authPlugins.push(auth);
  if (role === "admin")
    return (await auth.getService().createAuthSession()).cookie;
  const user = await auth.getService().createUser({
    displayName: `${role} operator`,
    role,
    status: "active",
  });
  return (await auth.getService().createAuthSession(user.userId)).cookie;
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
    type: STUDIO_OVERVIEW_REGISTER_MESSAGE,
    sender: registration.pluginId,
    payload: registration,
  });
}

describe("Studio Overview workspace", () => {
  it("admits Trusted sessions, derives attention, and renders source-owned views", async () => {
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
        {
          id: STUDIO_OVERVIEW_WORKSPACE_ID,
          label: "Overview",
          badge: 2,
        },
        { id: "studio:account", label: "Account" },
      ],
    });

    const response = await findRoute(plugin, "/studio/api/workspace").handler(
      request(
        `/studio/api/workspace?id=${encodeURIComponent(STUDIO_OVERVIEW_WORKSPACE_ID)}`,
        cookie,
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      workspace: {
        id: STUDIO_OVERVIEW_WORKSPACE_ID,
        rendererName: "DeclarativeOperatorWorkspace",
        data: {
          refreshAfterMs: 15_000,
          view: {
            kicker: "Operator home",
            title: "Overview",
            blocks: [
              {
                type: "columns",
                primary: [
                  {
                    type: "card",
                    label: "Needs you",
                    metadata: ["2 need attention"],
                    blocks: [
                      {
                        type: "list",
                        items: [
                          {
                            title: "Publication Pipeline",
                            tone: "warn",
                            metadata: ["Publishing", "2 items"],
                            links: [
                              {
                                label: "Open publishing",
                                target: {
                                  kind: "launch",
                                  launch: { target: "publishing" },
                                },
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: "card",
                    label: "What happened",
                    blocks: [{ type: "list", items: [] }],
                  },
                ],
                aside: [
                  {
                    type: "card",
                    label: "Publication Pipeline",
                    presentation: "disclosure",
                    tone: "neutral",
                    blocks: expect.any(Array),
                  },
                  { type: "card", label: "Brain" },
                ],
              },
            ],
          },
        },
      },
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

    const route = findRoute(plugin, "/studio/api/workspace");
    const response = await route.handler(
      request(
        `/studio/api/workspace?id=${encodeURIComponent(STUDIO_OVERVIEW_WORKSPACE_ID)}`,
        cookie,
      ),
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
      ],
    });

    const response = await findRoute(plugin, "/studio/api/workspace").handler(
      request(
        `/studio/api/workspace?id=${encodeURIComponent(STUDIO_OVERVIEW_WORKSPACE_ID)}`,
        cookie,
      ),
    );
    const payload = JSON.stringify(await response.json());

    expect(payload).toContain("What happened");
    expect(payload).toContain('"presentation":"attention"');
    expect(payload).toContain('"presentation":"activity"');
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
        `/studio/api/workspace?id=${encodeURIComponent(STUDIO_OVERVIEW_WORKSPACE_ID)}`,
        cookie,
      ),
    );
    const synced = JSON.stringify(await response.json());
    expect(synced).toContain('"title":"synced-from-git"');
    expect(synced).toContain("Note created");
  });

  it("unregisters re-homed contributions and reserves the Overview id", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const cookie = await createSession(shell, "trusted");
    const plugin = studioPlugin();
    await plugin.register(shell);
    await registerContribution(shell, contribution());

    expect(
      await shell.getMessageBus().send({
        type: STUDIO_OVERVIEW_UNREGISTER_MESSAGE,
        sender: "content-pipeline",
        payload: {
          pluginId: "content-pipeline",
          contributionId: "publication-pipeline",
        },
      }),
    ).toMatchObject({ success: true });

    await shell.getMessageBus().send({
      type: STUDIO_WORKSPACE_UNREGISTER_MESSAGE,
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
        type: STUDIO_WORKSPACE_REGISTER_MESSAGE,
        sender: "external",
        payload: external,
      }),
    ).toMatchObject({
      success: false,
      error: expect.stringContaining("reserved by the host"),
    });
  });
});
