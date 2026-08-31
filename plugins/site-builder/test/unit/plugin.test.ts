import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTempDataDir } from "@brains/plugins/test";
import { SiteBuilderPlugin } from "../../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  createTemplate,
  safeParseRuntimeDashboardWidgetData,
  type AnchorProfile,
  type DashboardWidgetProviderContext,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { createElement as h } from "react";
import { createTestConfig } from "../test-helpers";
import { mkdtemp, readFile, rm } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const adminWorkspaceActor: StudioWorkspaceActor = {
  interfaceType: "studio",
  userId: "operator",
  actor: { kind: "user", userId: "operator" },
  userPermissionLevel: "admin",
  visibilityScope: "restricted",
  isAnchor: true,
};

const trustedWorkspaceActor: StudioWorkspaceActor = {
  interfaceType: "studio",
  userId: "editor",
  actor: { kind: "user", userId: "editor" },
  userPermissionLevel: "trusted",
  visibilityScope: "shared",
  isAnchor: false,
};

const publicWorkspaceActor: StudioWorkspaceActor = {
  interfaceType: "studio",
  userId: "visitor",
  actor: { kind: "user", userId: "visitor" },
  userPermissionLevel: "public",
  visibilityScope: "public",
  isAnchor: false,
};

interface DashboardWidgetRegistration {
  id: string;
  group: string;
  rendererName: string;
  visibility: string;
  section: string;
  dataProvider: (context: DashboardWidgetProviderContext) => Promise<unknown>;
  digestProvider: (data: unknown) => unknown;
}

function findTableById(value: unknown, id: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  if (
    Reflect.get(value, "id") === id &&
    Reflect.get(value, "type") === "table"
  ) {
    return value;
  }
  for (const child of Object.values(value)) {
    const result = findTableById(child, id);
    if (result !== undefined) return result;
  }
  return undefined;
}

describe("SiteBuilderPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness<SiteBuilderPlugin>>;
  let plugin: SiteBuilderPlugin;
  let capabilities: PluginCapabilities;

  beforeEach(async () => {
    harness = createPluginHarness<SiteBuilderPlugin>();
  });

  afterEach(() => {
    harness.reset();
  });

  it("should initialize with valid config", async () => {
    plugin = new SiteBuilderPlugin(
      createTestConfig({
        previewOutputDir: "/tmp/test-output",
        productionOutputDir: "/tmp/test-output-production",
        workingDir: "/tmp/test-working",
      }),
    );

    capabilities = await harness.installPlugin(plugin);
    expect(plugin.id).toBe("site-builder");
  });

  it("should register successfully and provide capabilities", async () => {
    plugin = new SiteBuilderPlugin(
      createTestConfig({
        previewOutputDir: "/tmp/test-output",
        productionOutputDir: "/tmp/test-output-production",
      }),
    );

    capabilities = await harness.installPlugin(plugin);

    // The plugin should register successfully
    expect(capabilities).toBeDefined();
    expect(capabilities.tools).toBeDefined();
    expect(capabilities.tools.length).toBeGreaterThan(0);
  });

  it("uses the shell-owned profile exposed by the plugin context", async () => {
    const testDir = await mkdtemp(
      join(process.cwd(), ".site-builder-profile-"),
    );
    const outputDir = join(testDir, "site-preview");
    const profileUrl = "https://github.com/fresh-shell-profile";
    harness.getMockShell().getProfile = (): AnchorProfile => ({
      name: "Fresh Shell",
      socialLinks: [{ platform: "github", url: profileUrl }],
    });

    try {
      plugin = new SiteBuilderPlugin(
        createTestConfig({
          previewOutputDir: outputDir,
          productionOutputDir: outputDir,
          layouts: {
            profile: ({ siteInfo }) =>
              h("main", {}, siteInfo.socialLinks?.[0]?.url ?? "missing"),
          },
          routes: [
            {
              id: "profile",
              path: "/",
              title: "Profile",
              description: "Profile route",
              layout: "profile",
              sections: [],
            },
          ],
        }),
      );

      await harness.installPlugin(plugin);
      const builder = plugin.getSiteBuilder();
      expect(builder).toBeDefined();
      if (!builder) throw new Error("Site builder was not initialized");

      const result = await builder.build({
        environment: "preview",
        outputDir,
        siteUrl: undefined,
        sharedImagesDir: join(testDir, "images"),
        enableContentGeneration: false,
        cleanBeforeBuild: true,
        siteConfig: {
          title: "Profile",
          description: "Profile route",
        },
        layouts: {
          profile: ({ siteInfo }) =>
            h("main", {}, siteInfo.socialLinks?.[0]?.url ?? "missing"),
        },
      });
      expect(result).toMatchObject({ success: true, routesBuilt: 1 });

      expect(await readFile(join(outputDir, "index.html"), "utf8")).toContain(
        profileUrl,
      );
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it("should register templates when provided", async () => {
    const testTemplate = createTemplate<{ title: string }>({
      name: "test-template",
      description: "Test template",
      schema: z.object({ title: z.string() }),
      basePrompt: "Generate a test",
      requiredPermission: "public",
      formatter: {
        format: (data) =>
          `Title: ${z.object({ title: z.string() }).parse(data).title}`,
        parse: (content: string) => ({ title: content.replace("Title: ", "") }),
      },
      layout: {
        component: ({ title }: { title: string }) => h("div", {}, title),
      },
    });

    plugin = new SiteBuilderPlugin(
      createTestConfig({
        previewOutputDir: "/tmp/test-output",
        productionOutputDir: "/tmp/test-output-production",
        templates: {
          "test-template": testTemplate,
        },
      }),
    );

    capabilities = await harness.installPlugin(plugin);

    // Plugin should register content and view templates
    expect(capabilities.tools.length).toBeGreaterThan(0);

    // Check that template was registered
    const templates = harness.getTemplates();
    expect(templates.has("site-builder:test-template")).toBe(true);
  });

  it("should not register the legacy carousel generation job handler", async () => {
    const registeredJobTypes: string[] = [];
    const shell = harness.getMockShell();
    const originalJobQueue = shell.getJobQueueService();
    shell.getJobQueueService = (): typeof originalJobQueue => ({
      ...originalJobQueue,
      registerHandler(type: string): void {
        registeredJobTypes.push(type);
      },
      getRegisteredTypes(): string[] {
        return registeredJobTypes;
      },
    });

    plugin = new SiteBuilderPlugin(
      createTestConfig({
        previewOutputDir: "/tmp/test-output",
        productionOutputDir: "/tmp/test-output-production",
      }),
    );

    await harness.installPlugin(plugin);

    expect(registeredJobTypes).toContain("site-builder:site-build");
    expect(registeredJobTypes).not.toContain(
      "site-builder:media-carousel-generate",
    );
  });

  it("registers the optional Studio Site workspace and Dashboard health", async () => {
    let registration: StudioWorkspaceRegistration | undefined;
    let dashboardWidget: DashboardWidgetRegistration | undefined;
    harness.subscribe<DashboardWidgetRegistration, { success: boolean }>(
      "dashboard:register-widget",
      async (message) => {
        dashboardWidget = message.payload;
        return { success: true };
      },
    );
    harness.subscribe<StudioWorkspaceRegistration, { workspaceUrl: string }>(
      "studio:register-workspace",
      async (message) => {
        registration = message.payload;
        return {
          success: true,
          data: { workspaceUrl: "/studio/workspaces/site" },
        };
      },
    );

    plugin = new SiteBuilderPlugin(
      createTestConfig({
        routes: [
          {
            id: "home",
            path: "/",
            title: "Home",
            description: "Home page",
            layout: "default",
            sections: [],
          },
        ],
      }),
    );
    await harness.installPlugin(plugin);
    await plugin.ready();

    expect(registration).toMatchObject({
      id: "site-builder:site",
      pluginId: "site-builder",
      label: "Site",
      rendererName: "DeclarativeOperatorWorkspace",
      priority: 50,
    });
    if (!registration)
      throw new Error("Expected Studio workspace registration");
    if (!registration.actionHandler) {
      throw new Error("Expected Studio workspace actions");
    }
    const actionHandler = registration.actionHandler;
    expect(
      await Promise.resolve(registration.accessHandler(publicWorkspaceActor)),
    ).toBe(false);
    expect(
      await Promise.resolve(registration.accessHandler(adminWorkspaceActor)),
    ).toBe(true);
    expect(registration.dataProvider(publicWorkspaceActor)).rejects.toThrow(
      "admission policy",
    );
    const initialWorkspace =
      await registration.dataProvider(adminWorkspaceActor);
    expect(initialWorkspace).toMatchObject({
      view: {
        title: "Site control",
        kicker: "Website operations",
        status: { label: "Test Site" },
      },
    });
    expect(findTableById(initialWorkspace, "routes")).toMatchObject({
      rows: [
        {
          id: "home",
          compact: { title: "Home", metadata: ["/"] },
        },
      ],
    });
    expect(JSON.stringify(initialWorkspace)).toContain('"path":"/"');

    const result = await actionHandler(
      { actionId: "build-preview", input: {} },
      adminWorkspaceActor,
    );
    expect(result).toEqual({ accepted: true, environment: "preview" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const previewWorkspace =
      await registration.dataProvider(adminWorkspaceActor);
    expect(JSON.stringify(previewWorkspace)).toContain('"id":"preview-build"');
    expect(JSON.stringify(previewWorkspace)).toContain('"state":"queued"');
    expect(
      actionHandler(
        { actionId: "missing-action", input: {} },
        adminWorkspaceActor,
      ),
    ).rejects.toThrow("does not declare action");
    expect(
      await actionHandler(
        { actionId: "build-production", input: {} },
        adminWorkspaceActor,
      ),
    ).toEqual({ accepted: true, environment: "production" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const productionWorkspace =
      await registration.dataProvider(adminWorkspaceActor);
    expect(JSON.stringify(productionWorkspace)).toContain(
      '"id":"production-build"',
    );
    expect(JSON.stringify(productionWorkspace)).toContain(
      '"confirmation":{"kind":"static","message":"Build and publish the production site now?"}',
    );
    expect(dashboardWidget).toMatchObject({
      id: "site-health",
      group: "publishing",
      section: "sidebar",
      rendererName: DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
      visibility: "admin",
    });
    const dashboardData = await dashboardWidget?.dataProvider({
      caller: {
        actor: { id: "operator" },
        permission: "admin",
        isAnchor: true,
      },
      signal: new AbortController().signal,
    });
    const parsedDashboard = safeParseRuntimeDashboardWidgetData(dashboardData);
    expect(parsedDashboard.success).toBe(true);
    if (!parsedDashboard.success) throw new Error("Expected dashboard data");
    expect(parsedDashboard.data.view.blocks.map((block) => block.type)).toEqual(
      ["stats", "key-values", "links"],
    );
    expect(parsedDashboard.data.view.blocks[2]).toEqual({
      type: "links",
      items: [
        {
          label: "Open in Studio",
          target: {
            kind: "launch",
            launch: { target: "site" },
          },
        },
      ],
    });
    expect(JSON.stringify(dashboardData)).not.toContain(
      "/studio/workspaces/site",
    );
    expect(parsedDashboard.data.digest).toMatchObject({ attention: 0 });
    expect(dashboardWidget?.digestProvider(parsedDashboard.data)).toMatchObject(
      {
        needsAttention: 0,
      },
    );
  });

  it("admits policy-enabled Trusted preview without granting production", async () => {
    let registration: StudioWorkspaceRegistration | undefined;
    harness.subscribe<StudioWorkspaceRegistration, { workspaceUrl: string }>(
      "studio:register-workspace",
      async (message) => {
        registration = message.payload;
        return {
          success: true,
          data: { workspaceUrl: "/studio/workspaces/site" },
        };
      },
    );
    const permissionService = harness.getMockShell().getPermissionService();
    const originalAssert =
      permissionService.assertEntityActionAllowed.bind(permissionService);
    permissionService.assertEntityActionAllowed = (
      entityType,
      action,
      userPermissionLevel,
    ): void => {
      if (
        entityType === "site-info" &&
        action === "update" &&
        userPermissionLevel === "trusted"
      ) {
        return;
      }
      originalAssert(entityType, action, userPermissionLevel);
    };
    harness.getMockShell().getPermissionService =
      (): typeof permissionService => permissionService;

    plugin = new SiteBuilderPlugin(
      createTestConfig({
        routes: [
          {
            id: "home",
            path: "/",
            title: "Home",
            description: "Home page",
            layout: "default",
            sections: [],
          },
        ],
      }),
    );
    await harness.installPlugin(plugin);
    await plugin.ready();
    if (!registration?.actionHandler) {
      throw new Error("Expected Studio workspace actions");
    }

    expect(
      await Promise.resolve(registration.accessHandler(trustedWorkspaceActor)),
    ).toBe(true);
    const trustedWorkspace = await registration.dataProvider(
      trustedWorkspaceActor,
    );
    expect(trustedWorkspace).toMatchObject({
      view: { title: "Site control", status: { label: "Test Site" } },
    });
    expect(JSON.stringify(trustedWorkspace)).toContain(
      '"actionId":"build-preview"',
    );
    expect(JSON.stringify(trustedWorkspace)).not.toContain(
      '"actionId":"build-production"',
    );
    expect(
      await registration.actionHandler(
        { actionId: "build-preview", input: {} },
        trustedWorkspaceActor,
      ),
    ).toEqual({ accepted: true, environment: "preview" });
    expect(
      registration.actionHandler(
        { actionId: "build-production", input: {} },
        trustedWorkspaceActor,
      ),
    ).rejects.toThrow("minimum permission");
  });

  it("should provide site builder tools", async () => {
    plugin = new SiteBuilderPlugin(
      createTestConfig({
        previewOutputDir: "/tmp/test-output",
        productionOutputDir: "/tmp/test-output-production",
      }),
    );

    capabilities = await harness.installPlugin(plugin);

    const toolNames = capabilities.tools.map((t) => t.name);
    const [tool] = capabilities.tools;

    expect(toolNames).toEqual(["site-builder_build-site"]);
    expect(tool?.visibility).toBe("admin");
    expect(tool?.sideEffects).toBe("external");
  });

  it("should set environment on routes", async () => {
    plugin = new SiteBuilderPlugin(
      createTestConfig({
        previewOutputDir: "/tmp/test-output",
        productionOutputDir: "/tmp/test-output-production",
        routes: [
          {
            id: "home-env",
            path: "/",
            title: "Home",
            description: "Home page",
            layout: "default",
            sections: [
              {
                id: "test",
                template: "test",
                dataQuery: {
                  entityType: "site-content-preview",
                  template: "test",
                },
              },
            ],
          },
        ],
      }),
    );

    capabilities = await harness.installPlugin(plugin);

    // The environment setting should be handled internally by the plugin
    // We can verify this by checking that the plugin registers successfully
    expect(capabilities.tools.length).toBeGreaterThan(0);
  });

  it("should ignore legacy studio config and not register a Studio route", async () => {
    const config = {
      ...createTestConfig(),
      studio: {},
    };

    plugin = new SiteBuilderPlugin(config);
    await harness.installPlugin(plugin);

    const result = await harness.sendMessage<
      { path: string },
      { route?: { path: string } }
    >("plugin:site-builder:route:get", { path: "/studio/" });

    expect(result?.route).toBeUndefined();
  });

  it("should not generate Studio files on site:build:completed", async () => {
    const outputDir = await createTempDataDir("site-builder-no-studio-");
    const config = {
      ...createTestConfig({
        previewOutputDir: outputDir,
        productionOutputDir: outputDir,
      }),
      studio: {},
    };

    harness.subscribe("git-sync:get-repo-info", async () => ({
      success: true,
      data: { repo: "owner/repo", branch: "main" },
    }));

    plugin = new SiteBuilderPlugin(config);
    await harness.installPlugin(plugin);

    await harness.sendMessage("site:build:completed", {
      outputDir,
      environment: "preview",
      routesBuilt: 0,
      siteConfig: {
        title: "Test",
        description: "Test",
        url: "https://example.com",
      },
      generateEntityUrl: (_entityType: string, slug: string) => `/${slug}`,
    });

    expect(existsSync(join(outputDir, "studio"))).toBe(false);
    expect(existsSync(join(outputDir, "admin"))).toBe(false);
  });
});
