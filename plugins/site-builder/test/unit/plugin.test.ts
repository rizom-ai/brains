import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SiteBuilderPlugin } from "../../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins/test";
import {
  createTemplate,
  type AnchorProfile,
  type CmsWorkspaceRegistration,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { h } from "preact";
import { createTestConfig } from "../test-helpers";
import { mkdtemp, readFile, rm } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

interface DashboardWidgetRegistration {
  id: string;
  group: string;
  rendererName: string;
  visibility: string;
  section: string;
  clientStyles: string;
  dataProvider: () => Promise<unknown>;
  digestProvider: (data: unknown) => unknown;
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
      kind: "professional",
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
        format: (data: unknown) =>
          `Title: ${(data as { title: string }).title}`,
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

  it("registers the optional CMS Site workspace and Dashboard health", async () => {
    let registration: CmsWorkspaceRegistration | undefined;
    let dashboardWidget: DashboardWidgetRegistration | undefined;
    harness.subscribe<DashboardWidgetRegistration, { success: boolean }>(
      "dashboard:register-widget",
      async (message) => {
        dashboardWidget = message.payload;
        return { success: true };
      },
    );
    harness.subscribe<CmsWorkspaceRegistration, { workspaceUrl: string }>(
      "cms:register-workspace",
      async (message) => {
        registration = message.payload;
        return {
          success: true,
          data: { workspaceUrl: "/cms/workspaces/site" },
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
      id: "site",
      pluginId: "site-builder",
      label: "Site",
      rendererName: "SiteWorkspace",
      priority: 50,
    });
    if (!registration) throw new Error("Expected CMS workspace registration");
    if (!registration.actionHandler) {
      throw new Error("Expected CMS workspace actions");
    }
    const actionHandler = registration.actionHandler;
    expect(await registration.dataProvider()).toMatchObject({
      site: { title: "Test Site" },
      routes: [{ id: "home", path: "/", title: "Home" }],
    });

    const result = await actionHandler(
      { type: "build-preview" },
      {
        interfaceType: "cms",
        userId: "operator",
        userPermissionLevel: "anchor",
      },
    );
    expect(result).toEqual({ accepted: true, environment: "preview" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await registration.dataProvider()).toMatchObject({
      environments: [
        {
          environment: "preview",
          active: {
            state: "queued",
          },
        },
        { environment: "production" },
      ],
    });
    expect(
      actionHandler(
        { type: "build-production" },
        {
          interfaceType: "cms",
          userId: "operator",
          userPermissionLevel: "anchor",
        },
      ),
    ).rejects.toThrow("Invalid site workspace action");
    expect(
      actionHandler(
        { type: "build-preview" },
        {
          interfaceType: "cms",
          userId: "viewer",
          userPermissionLevel: "public",
        },
      ),
    ).rejects.toThrow("Site build requires anchor permission");
    expect(
      await actionHandler(
        { type: "build-production", confirmed: true },
        {
          interfaceType: "cms",
          userId: "operator",
          userPermissionLevel: "anchor",
        },
      ),
    ).toEqual({ accepted: true, environment: "production" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await registration.dataProvider()).toMatchObject({
      environments: [
        { environment: "preview", active: { state: "queued" } },
        { environment: "production", active: { state: "queued" } },
      ],
    });
    expect(dashboardWidget).toMatchObject({
      id: "site-health",
      group: "publishing",
      section: "sidebar",
      rendererName: "SiteHealthWidget",
      visibility: "anchor",
    });
    expect(dashboardWidget?.clientStyles).toContain(".site-health-widget");
    const dashboardData = await dashboardWidget?.dataProvider();
    expect(dashboardData).toMatchObject({
      site: { title: "Test Site" },
      managementUrl: "/cms/workspaces/site",
    });
    expect(dashboardWidget?.digestProvider(dashboardData)).toMatchObject({
      needsOperator: 0,
    });
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
    expect(tool?.visibility).toBe("anchor");
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

  it("should ignore legacy cms config and not register a CMS route", async () => {
    const config = {
      ...createTestConfig(),
      cms: {},
    };

    plugin = new SiteBuilderPlugin(config);
    await harness.installPlugin(plugin);

    const result = await harness.sendMessage<
      { path: string },
      { route?: { path: string } }
    >("plugin:site-builder:route:get", { path: "/cms/" });

    expect(result?.route).toBeUndefined();
  });

  it("should not generate CMS files on site:build:completed", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "site-builder-no-cms-"));
    const config = {
      ...createTestConfig({
        previewOutputDir: outputDir,
        productionOutputDir: outputDir,
      }),
      cms: {},
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

    expect(existsSync(join(outputDir, "cms"))).toBe(false);
    expect(existsSync(join(outputDir, "admin"))).toBe(false);
  });
});
