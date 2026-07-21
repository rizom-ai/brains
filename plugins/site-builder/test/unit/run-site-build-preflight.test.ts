import { describe, expect, it, mock } from "bun:test";
import type { RouteDefinitionInput } from "@brains/site-composition";
import { RouteRegistry } from "@brains/site-engine";
import {
  createMockServicePluginContext,
  createSilentLogger,
} from "@brains/test-utils";
import type { BuildPipelineContext } from "../../src/lib/build-pipeline-context";
import type { BuildResult } from "../../src/types/site-builder-types";
import { runSiteBuild } from "../../src/lib/run-site-build";
import type { StaticSiteBuilderFactory } from "../../src/lib/static-site-builder";
import { createSiteBuilderServices, TestLayout } from "../test-helpers";

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
): Promise<BuildResult> {
  return runSiteBuild({
    buildOptions: {
      environment: "production",
      outputDir,
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
    pipelineContext: createPipelineContext(route),
    staticSiteBuilderFactory,
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
