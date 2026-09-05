import { AuthServicePlugin } from "@brains/auth-service";
import { ENTITY_CHANNELS, JOB_CHANNELS } from "@brains/contracts";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  STUDIO_OVERVIEW_REGISTER_MESSAGE,
  STUDIO_OVERVIEW_UNREGISTER_MESSAGE,
  STUDIO_WORKSPACE_REGISTER_MESSAGE,
  STUDIO_WORKSPACE_UNREGISTER_MESSAGE,
  type DashboardWidgetProviderContext,
  type StudioOverviewContributionRegistration,
  type StudioWorkspaceRegistration,
  type WebRouteDefinition,
} from "@brains/plugins";
import {
  createMockShell,
  createTempDataDir,
  type MockShell,
} from "@brains/plugins/test";

import { afterEach, describe, expect, it } from "bun:test";
import { studioPlugin, type StudioPlugin } from "../src";
import { STUDIO_OVERVIEW_WORKSPACE_ID } from "../src/overview-workspace";

const authPlugins: AuthServicePlugin[] = [];

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
            status: { label: "2 need you", tone: "warn" },
            blocks: [
              {
                type: "columns",
                primary: [
                  {
                    type: "card",
                    label: "Needs attention",
                    blocks: [
                      {
                        type: "list",
                        items: [
                          {
                            title: "Publication Pipeline",
                            tone: "warn",
                            link: {
                              kind: "launch",
                              launch: { target: "publishing" },
                            },
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: "card",
                    label: "Publication Pipeline",
                    blocks: expect.any(Array),
                  },
                ],
                aside: [
                  { type: "card", label: "System" },
                  { type: "card", label: "Network" },
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

    expect(payload).toContain("While you were away");
    expect(payload).toContain("site:build completed");
    expect(payload).toContain("newsletter:dispatch failed");
    expect(payload).toContain("Transport rejected the payload");
    expect(payload).toContain("note/field-log updated");
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
