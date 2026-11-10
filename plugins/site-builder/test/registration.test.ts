import { afterEach, describe, expect, it } from "bun:test";
import { waitUntil } from "@brains/test-utils";
import {
  SYSTEM_CHANNELS,
  createServicePluginContext,
  createTemplate,
  dashboardWidgetRegisterContract,
  studioWorkspaceRegisterContract,
  studioWorkspaceUnregisterContract,
  type DashboardWidgetRegistration,
  type Plugin,
  type StudioWorkspaceRegistration,
} from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import {
  siteBuilderRouteRegisterContract,
  siteBuilderRoutesContract,
} from "@brains/site-composition";
import { projectionWaveReadyContract } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { createElement as h } from "react";
import { createSiteBuilderPlugin } from "./site-builder-plugin";
import { TestLayout } from "./test-helpers";

const hero = createTemplate({
  name: "hero",
  description: "A hero section",
  schema: z.object({ headline: z.string() }),
  basePrompt: "",
  requiredPermission: "public",
  layout: { component: () => h("section", {}) },
});

interface Installed {
  shell: MockShell;
  plugin: Plugin;
  workspaces: StudioWorkspaceRegistration[];
  widgets: Array<DashboardWidgetRegistration & { pluginId: string }>;
  capabilities: Awaited<ReturnType<Plugin["register"]>>;
}

const installedPlugins: Plugin[] = [];

afterEach(async () => {
  for (const plugin of installedPlugins.splice(0)) await plugin.shutdown?.();
});

async function installed(
  options: { autoRebuild?: boolean } = {},
): Promise<Installed> {
  const shell = createMockShell({ domain: "brain.test" });
  const workspaces: StudioWorkspaceRegistration[] = [];
  const widgets: Installed["widgets"] = [];
  const bus = shell.getMessageBus();
  bus.subscribe<StudioWorkspaceRegistration, { workspaceUrl: string }>(
    studioWorkspaceRegisterContract.name,
    async (message) => {
      workspaces.push(message.payload);
      return {
        success: true,
        data: { workspaceUrl: `/studio/workspaces/${message.payload.id}` },
      };
    },
  );
  bus.subscribe<DashboardWidgetRegistration & { pluginId: string }>(
    dashboardWidgetRegisterContract.name,
    async (message) => {
      widgets.push(message.payload);
      return { success: true };
    },
  );
  const plugin = createSiteBuilderPlugin({
    previewOutputDir: "/tmp/site-builder-registration-preview",
    productionOutputDir: "/tmp/site-builder-registration-production",
    sharedImagesDir: "/tmp/site-builder-registration-images",
    layouts: { default: TestLayout },
    templates: { hero },
    autoRebuild: options.autoRebuild ?? false,
    rebuildDebounce: 100,
  });
  installedPlugins.push(plugin);
  const capabilities = await plugin.register(shell);
  await plugin.finalizeRegistration?.();
  await bus.send({
    type: SYSTEM_CHANNELS.pluginsRegistered,
    payload: {},
    sender: "shell",
  });
  await plugin.ready?.();
  return { shell, plugin, workspaces, widgets, capabilities };
}

/**
 * What the site-builder package registers, pinned as the site-builder plugin
 * class registered it: brains call its tool and read its resources by these
 * names, sites read its navigation data source and templates, other packages
 * declare pages over its contracts, Studio and the Dashboard show its
 * workspace and widget, the runtime HTTP host serves the directories it
 * writes, and a requested build is queued under site-builder:site-build.
 */
describe("the site-builder package's registered surface", () => {
  it("is the site-builder service, serving no routes of its own", async () => {
    const { plugin } = await installed();
    expect([plugin.id, plugin.type, plugin.packageName]).toEqual([
      "site-builder",
      "service",
      "@brains/site-builder-plugin",
    ]);
    expect(plugin.dependencies ?? []).toEqual([]);
    expect(plugin.getWebRoutes?.() ?? []).toEqual([]);
    expect(plugin.getApiRoutes?.() ?? []).toEqual([]);
    expect(plugin.getStaticSiteOutput?.()).toEqual({
      productionOutputDir: "/tmp/site-builder-registration-production",
      previewOutputDir: "/tmp/site-builder-registration-preview",
      sharedImagesDir: "/tmp/site-builder-registration-images",
    });
  });

  it("registers its build tool and its three resources", async () => {
    const { capabilities } = await installed();
    expect(
      capabilities.tools.map((tool) => ({
        name: tool.name,
        visibility: tool.visibility,
        sideEffects: tool.sideEffects,
        cli: tool.cli,
        input: Object.keys(tool.inputSchema),
      })),
    ).toEqual([
      {
        name: "site-builder_build-site",
        visibility: "admin",
        sideEffects: "external",
        cli: { name: "build" },
        input: ["environment"],
      },
    ]);
    expect(
      capabilities.resources.map(({ uri, name, description, mimeType }) => ({
        uri,
        name,
        description,
        mimeType,
      })),
    ).toEqual([
      {
        uri: "brain://site",
        name: "Site Metadata",
        description: "Site metadata — title, description, domain, URLs",
        mimeType: "application/json",
      },
      {
        uri: "site://routes",
        name: "Site Routes",
        description: "All registered routes with sections and templates",
        mimeType: "application/json",
      },
      {
        uri: "site://templates",
        name: "View Templates",
        description: "All registered view templates",
        mimeType: "application/json",
      },
    ]);
    expect(capabilities.instructions).toBe(
      "## Your Site\n**Title:** Brain\n**Description:** A knowledge management system\n**Domain:** brain.test\n**URL:** https://brain.test",
    );
  });

  it("registers its configured templates, its navigation data source and its build job", async () => {
    const { shell } = await installed();
    expect(shell.getTemplate("site-builder:hero")?.name).toBe("hero");
    expect(shell.getDataSourceRegistry().get("site:navigation")?.name).toBe(
      "Site Navigation DataSource",
    );
    const handler = shell
      .getJobQueueService()
      .getHandler("site-builder:site-build");
    expect({
      exclusive: handler?.exclusive,
      executionTimeoutMs: handler?.executionTimeoutMs,
    }).toEqual({ exclusive: true, executionTimeoutMs: 30 * 60_000 });
  });

  it("answers the route contracts other packages declare their pages over", async () => {
    const { shell } = await installed();
    const bus = shell.getMessageBus();
    await bus.send({
      type: siteBuilderRouteRegisterContract.name,
      payload: {
        pluginId: "contact",
        routes: [
          {
            id: "contact",
            path: "/contact",
            title: "Contact",
            sections: [{ id: "form", template: "contact:page", content: {} }],
            navigation: { show: false },
          },
        ],
      },
      sender: "contact",
    });
    const listed = await bus.send({
      type: siteBuilderRoutesContract.name,
      payload: {},
      sender: "site-content",
    });
    expect(
      (Array.isArray(Reflect.get(Object(listed), "data"))
        ? Reflect.get(Object(listed), "data")
        : []
      ).map((route: { path: string }) => route.path),
    ).toEqual(["/contact"]);
  });

  it("registers its Studio workspace and Dashboard widget once the brain is ready", async () => {
    const { workspaces, widgets } = await installed();
    expect(
      workspaces.map((workspace) => ({
        id: workspace.id,
        pluginId: workspace.pluginId,
        label: workspace.label,
        rendererName: workspace.rendererName,
        priority: workspace.priority,
        permission: workspace.permission,
        entityTypes: workspace.entityTypes,
        urlQuery: workspace.urlQuery,
        aliases: workspace.aliases,
        actions: typeof workspace.actionHandler,
        access: typeof workspace.accessHandler,
      })),
    ).toEqual([
      {
        id: "site-builder:site",
        pluginId: "site-builder",
        label: "Site",
        rendererName: "DeclarativeOperatorWorkspace",
        priority: 50,
        permission: "trusted",
        entityTypes: [],
        urlQuery: undefined,
        aliases: undefined,
        actions: "function",
        access: "function",
      },
    ]);
    expect(
      widgets.map((widget) => ({
        id: widget.id,
        pluginId: widget.pluginId,
        rendererName: widget.rendererName,
        title: widget.title,
        group: widget.group,
        priority: widget.priority,
        section: widget.section,
        visibility: widget.visibility,
      })),
    ).toEqual([
      {
        id: "site-health",
        pluginId: "site-builder",
        rendererName: "DeclarativeOperatorWidget",
        title: "Site health",
        group: "publishing",
        priority: 50,
        section: "sidebar",
        visibility: "admin",
      },
    ]);
  });

  it("queues a requested build as the package, attributed to nobody", async () => {
    const { shell, capabilities } = await installed();
    const tool = capabilities.tools[0];
    expect(
      await tool?.handler(
        { environment: "preview" },
        {
          interfaceType: "cli",
          actor: { kind: "user", userId: "operator" },
          userPermissionLevel: "admin",
        },
      ),
    ).toEqual({
      success: true,
      message: "Site build requested for preview (debounced)",
      data: {},
    });
    await waitUntil(
      async () => Boolean(await shell.getJobQueueService().getStatus("job-1")),
      "the debounced build is queued",
    );
    const job = await shell.getJobQueueService().getStatus("job-1");
    expect({
      type: job?.type,
      source: job?.source,
      data: { ...JSON.parse(job?.data ?? "{}"), metadata: undefined },
      metadata: job?.metadata,
    }).toEqual({
      type: "site-builder:site-build",
      source: "site-builder",
      data: {
        environment: "preview",
        outputDir: "/tmp/site-builder-registration-preview",
        workingDir: "./.react-work",
        enableContentGeneration: true,
        metadata: undefined,
      },
      metadata: {
        operationType: "content_operations",
        pluginId: "site-builder",
        rootJobId: "job-1",
      },
    });
  });

  it("rebuilds after a projection wave only with auto-rebuild, answering in every process", async () => {
    const off = await installed();
    expect(
      await createServicePluginContext(off.shell, "scheduler").messaging.gather(
        projectionWaveReadyContract,
        {
          waveId: "wave-1",
          sourceTypes: ["post"],
          changedTargetTypes: [],
        },
      ),
    ).toEqual({ status: "unavailable" });

    const on = await installed({ autoRebuild: true });
    expect(
      await createServicePluginContext(on.shell, "scheduler").messaging.gather(
        projectionWaveReadyContract,
        {
          waveId: "wave-2",
          sourceTypes: ["post"],
          changedTargetTypes: [],
        },
      ),
    ).toMatchObject({ status: "answered", answers: [{}] });
  });

  it("unregisters its Studio workspace when it shuts down", async () => {
    const { shell, plugin } = await installed();
    const unregistered: unknown[] = [];
    shell
      .getMessageBus()
      .subscribe(studioWorkspaceUnregisterContract.name, async (message) => {
        unregistered.push(message.payload);
        return { success: true };
      });
    await plugin.shutdown?.();
    expect(unregistered).toEqual([
      { pluginId: "site-builder", workspaceId: "site-builder:site" },
    ]);
  });
});
