import { describe, expect, it, mock } from "bun:test";
import type { RouteDefinitionInput } from "@brains/site-composition";
import { RouteRegistry } from "@brains/site-engine";
import {
  createMockServicePluginContext,
  createSilentLogger,
} from "@brains/test-utils";
import type { BuildPipelineContext } from "../../src/lib/build-pipeline-context";
import type { BuildResult } from "../../src/types/site-builder-types";
import type { SiteViewTemplate } from "../../src/lib/site-view-template";
import { z } from "@brains/utils/zod";
import { h, type VNode } from "preact";
import { runSiteBuild } from "../../src/lib/run-site-build";
import type { StaticSiteBuilderFactory } from "../../src/lib/static-site-builder";
import {
  createSiteBuilderServices,
  createTestSiteBuildOutputLifecycle,
  TestLayout,
} from "../test-helpers";

const outputDir = "/tmp/site-build-preflight-output";

function createPipelineContext(
  route: RouteDefinitionInput,
): BuildPipelineContext {
  const logger = createSilentLogger();
  const context = createMockServicePluginContext({ logger });
  const routeRegistry = new RouteRegistry(logger);
  routeRegistry.register(route);
  return {
    logger,
    services: createSiteBuilderServices(context),
    routeRegistry,
    profileService: { getProfile: () => ({}) },
    entityDisplay: undefined,
  };
}

function run(
  route: RouteDefinitionInput,
  staticSiteBuilderFactory: StaticSiteBuilderFactory,
  configure?: (pipelineContext: BuildPipelineContext) => void,
): Promise<BuildResult> {
  const pipelineContext = createPipelineContext(route);
  configure?.(pipelineContext);
  return runSiteBuild({
    buildOptions: {
      environment: "production",
      outputDir,
      siteUrl: undefined,
      sharedImagesDir: "/tmp/site-build-preflight-images",
      enableContentGeneration: false,
      cleanBeforeBuild: true,
      siteConfig: {
        title: "Test Site",
        description: "Test site",
      },
      layouts: { default: TestLayout },
    },
    progress: undefined,
    pipelineContext,
    staticSiteBuilderFactory,
    outputLifecycle: createTestSiteBuildOutputLifecycle(),
    signal: new AbortController().signal,
  });
}

function createRoute(
  overrides: Partial<RouteDefinitionInput> = {},
): RouteDefinitionInput {
  return {
    id: "home",
    path: "/",
    title: "Home",
    description: "Home route",
    layout: "default",
    sections: [],
    ...overrides,
  };
}

describe("runSiteBuild preflight", () => {
  it("returns diagnostics without creating or cleaning the renderer for unsafe output", async () => {
    const staticSiteBuilderFactory = mock<StaticSiteBuilderFactory>(() => ({
      clean: mock(async () => undefined),
      build: mock(async () => undefined),
    }));

    const result = await run(
      createRoute({ id: "unsafe", path: "/../outside" }),
      staticSiteBuilderFactory,
    );

    expect(staticSiteBuilderFactory).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      outputDir,
      routesBuilt: 0,
      errors: [
        '[unsafe-route-path] Route "unsafe" path "/../outside" is unsafe: path contains a .. segment',
      ],
      diagnostics: [
        expect.objectContaining({
          severity: "error",
          code: "unsafe-route-path",
          routeId: "unsafe",
          path: "/../outside",
        }),
      ],
    });
  });

  it("returns missing templates as structured warnings on successful builds", async () => {
    const staticSiteBuilderFactory = mock<StaticSiteBuilderFactory>(() => ({
      clean: mock(async () => undefined),
      build: mock(async () => undefined),
    }));

    const result = await run(
      createRoute({
        sections: [
          { id: "hero", template: "missing:hero", content: { title: "Hi" } },
        ],
      }),
      staticSiteBuilderFactory,
    );

    expect(result).toMatchObject({
      success: true,
      warnings: [
        '[missing-template] Route "home" section "hero" references missing template "missing:hero"',
      ],
      diagnostics: [
        expect.objectContaining({
          severity: "warning",
          code: "missing-template",
          routeId: "home",
          sectionId: "hero",
        }),
      ],
    });
  });

  it("resolves all section content before renderer creation and cleanup", async () => {
    const events: string[] = [];
    const clean = mock(async () => {
      events.push("clean");
    });
    const build = mock(async (context) => {
      events.push("build");
      expect(context).not.toHaveProperty("getContent");
      expect(context.preparedBuild.routes[0]?.sections[0]?.data).toMatchObject({
        heading: "Prepared heading",
      });
    });
    const staticSiteBuilderFactory = mock<StaticSiteBuilderFactory>(() => ({
      clean,
      build,
    }));
    const template: SiteViewTemplate = {
      name: "fixture:hero",
      pluginId: "fixture",
      schema: z.object({ heading: z.string() }),
      renderers: { web: (): VNode => h("div", {}) },
    };

    const result = await run(
      createRoute({
        sections: [
          {
            id: "hero",
            template: "fixture:hero",
            content: { heading: "Prepared heading" },
          },
        ],
      }),
      staticSiteBuilderFactory,
      (pipelineContext) => {
        pipelineContext.services.getViewTemplate = (): SiteViewTemplate =>
          template;
        pipelineContext.services.resolveTemplateContent = mock(
          async (_templateName, resolutionOptions): Promise<never> => {
            events.push("resolve");
            return resolutionOptions?.fallback as never;
          },
        );
        pipelineContext.services.sendMessage = mock(async (request) => {
          if (request.type === "site:build:staging") events.push("staging");
          return { success: true };
        });
      },
    );

    expect(result.success).toBe(true);
    expect(events).toEqual(["resolve", "clean", "staging", "build"]);
  });

  it("does not create or clean the renderer when content preparation fails", async () => {
    const staticSiteBuilderFactory = mock<StaticSiteBuilderFactory>(() => ({
      clean: mock(async () => undefined),
      build: mock(async () => undefined),
    }));
    const template: SiteViewTemplate = {
      name: "fixture:hero",
      pluginId: "fixture",
      schema: z.object({ heading: z.string() }),
      renderers: { web: (): VNode => h("div", {}) },
    };

    const result = await run(
      createRoute({
        sections: [
          {
            id: "hero",
            template: "fixture:hero",
            dataQuery: { entityType: "post" },
          },
        ],
      }),
      staticSiteBuilderFactory,
      (pipelineContext) => {
        pipelineContext.services.getViewTemplate = (): SiteViewTemplate =>
          template;
        pipelineContext.services.resolveTemplateContent = mock(
          async (): Promise<never> => {
            throw new Error("datasource unavailable");
          },
        );
      },
    );

    expect(staticSiteBuilderFactory).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      diagnostics: [
        expect.objectContaining({
          severity: "error",
          code: "section-content-resolution-failed",
          routeId: "home",
          sectionId: "hero",
          message: expect.stringContaining("datasource unavailable"),
        }),
      ],
    });
  });

  it("preserves renderer error detail in failed build diagnostics", async () => {
    const clean = mock(async () => undefined);
    const build = mock(async () => {
      throw new Error("renderer exploded");
    });
    const staticSiteBuilderFactory = mock<StaticSiteBuilderFactory>(() => ({
      clean,
      build,
    }));

    const result = await run(createRoute(), staticSiteBuilderFactory);

    expect(clean).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: false,
      errors: ["[build-failed] Site build process failed: renderer exploded"],
      diagnostics: [
        expect.objectContaining({
          severity: "error",
          code: "build-failed",
          message: "Site build process failed: renderer exploded",
        }),
      ],
    });
  });
});
