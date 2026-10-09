import { createMockServicePluginContext } from "@brains/plugins/test";
import { afterEach, describe, expect, it, mock } from "bun:test";
import type { RouteDefinition } from "@brains/site-composition";
import {
  DEFAULT_FAVICON_SVG,
  RouteRegistry,
  type JsonObject,
  type ResolvedSiteImage,
  type SiteImageLookup,
  type SiteImageMap,
} from "@brains/site-engine";
import { createSilentLogger } from "@brains/test-utils";
import { sha256Hex } from "@brains/utils/hash";
import type { ProgressNotification } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import { createElement as h, type ReactElement } from "react";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { BuildPipelineContext } from "../../src/lib/build-pipeline-context";
import { prepareSiteBuild } from "../../src/lib/prepare-site-build";
import { createSiteBuilderServices } from "../test-helpers";
import type { SiteBuildProfile } from "../../src/lib/site-build-profile-service";
import type { SiteViewTemplate } from "../../src/lib/site-view-template";

const templateDataSchema = z.custom<JsonObject>(
  (value) =>
    z
      .object({
        heading: z.string(),
        pageTitle: z.string(),
        pageLabel: z.string().nullable().default(null),
      })
      .safeParse(value).success,
);

function createPipelineContext(
  routes: RouteDefinition[],
): BuildPipelineContext {
  const logger = createSilentLogger();
  const context = createMockServicePluginContext({ logger });
  const routeRegistry = new RouteRegistry(logger);
  for (const route of routes) routeRegistry.register(route);

  context.views.get.mockImplementation((name) => {
    if (name !== "fixture:hero") return undefined;
    return {
      name,
      pluginId: "fixture",
      schema: templateDataSchema,
      renderers: { web: (): ReactElement => h("div", {}) },
      fullscreen: true,
      runtimeScripts: [{ src: "/scripts/hero.js", defer: true }],
      staticAssets: {
        "/scripts/hero.js": "template script",
        "/assets/template.txt": "template asset",
      },
    };
  });

  const services = createSiteBuilderServices(context);
  services.resolveTemplateContent = async (
    _templateName,
    options,
  ): Promise<unknown> => options?.fallback;

  return {
    logger,
    services,
    routeRegistry,
    profileService: {
      getProfile: (): SiteBuildProfile => ({}),
    },
    entityDisplay: undefined,
  };
}

const images: SiteImageMap = {
  cover: {
    src: "/images/cover.webp",
    width: 1200,
    height: 630,
  },
};

const imageBuildService: SiteImageLookup & { getMap(): SiteImageMap } = {
  get: (imageId: string): ResolvedSiteImage | undefined => images[imageId],
  getMap: (): SiteImageMap => images,
};

function createRoute(content: unknown): RouteDefinition {
  return {
    id: "home",
    path: "/",
    title: "Home Route",
    pageLabel: "Home Label",
    description: "Home description",
    layout: "default",
    sections: [
      {
        id: "hero",
        template: "fixture:hero",
        content,
      },
    ],
  };
}

describe("prepareSiteBuild", () => {
  const testDirectories: string[] = [];
  const missingPublicDir = join(tmpdir(), "site-builder-missing-public-assets");

  afterEach(async () => {
    await Promise.all(
      testDirectories
        .splice(0)
        .map((directory) => fs.rm(directory, { recursive: true, force: true })),
    );
  });

  it("creates a frozen, serializable snapshot with resolved route metadata and assets", async () => {
    const routes = [createRoute({ heading: "Prepared heading" })];
    const pipelineContext = createPipelineContext(routes);

    const result = await prepareSiteBuild({
      buildId: "prepared-build",
      preparedAt: "2026-07-22T00:00:00.000Z",
      routes,
      publicDir: missingPublicDir,
      signal: new AbortController().signal,
      parsedOptions: {
        environment: "preview",
        siteConfig: {
          title: "Fixture Site",
          description: "Fixture description",
          themeMode: "dark",
        },
        themeCSS: ":root { --fixture: true; }",
      },
      buildOptions: {
        headScripts: ['<script id="global"></script>'],
        staticAssets: {
          "/scripts/hero.js": "site override",
        },
      },
      pipelineContext,
      imageBuildService,
      siteMetadata: {
        title: "Fixture Site",
        description: "Fixture description",
        themeMode: "dark",
      },
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.preparedBuild).toMatchObject({
      buildId: "prepared-build",
      environment: "preview",
      site: {
        title: "Fixture Site",
        description: "Fixture description",
        themeMode: "dark",
      },
      routes: [
        {
          id: "home",
          fullscreen: true,
          headScripts: [
            `<script src="/scripts/hero.js?v=${sha256Hex("site override").slice(0, 12)}" defer></script>`,
          ],
          sections: [
            {
              id: "hero",
              template: "fixture:hero",
              data: {
                heading: "Prepared heading",
                pageTitle: "Home Route",
                pageLabel: "Home Label",
              },
            },
          ],
        },
      ],
      staticAssets: {
        "/scripts/hero.js": "site override",
        "/assets/template.txt": "template asset",
      },
      images,
      globalHeadScripts: ['<script id="global"></script>'],
    });
    expect(JSON.parse(JSON.stringify(result.preparedBuild))).toStrictEqual(
      result.preparedBuild,
    );
    expect(Object.isFrozen(result.preparedBuild.routes[0]?.sections)).toBe(
      true,
    );
  });

  it("reports progress as each route is prepared", async () => {
    // A large site spends minutes here; the job's deadline is renewed by
    // progress, so preparation has to report it.
    const routes: RouteDefinition[] = ["one", "two", "three"].map((id) => ({
      ...createRoute({ heading: id }),
      id,
      path: `/${id}`,
    }));
    const notifications: ProgressNotification[] = [];

    await prepareSiteBuild({
      buildId: "progress-build",
      preparedAt: "2026-07-22T00:00:00.000Z",
      routes,
      publicDir: missingPublicDir,
      signal: new AbortController().signal,
      parsedOptions: {
        environment: "preview",
        siteConfig: { title: "Fixture Site", description: "Fixture" },
      },
      buildOptions: {},
      pipelineContext: createPipelineContext(routes),
      imageBuildService,
      siteMetadata: { title: "Fixture Site", description: "Fixture" },
      onProgress: (notification) => notifications.push(notification),
    });

    expect(
      notifications.map(({ progress, total }) => [progress, total]),
    ).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it("gives the event loop a turn between sections", async () => {
    const order: string[] = [];
    const countedSchema = z.custom<JsonObject>((value) => {
      order.push("section");
      setImmediate(() => order.push("tick"));
      return templateDataSchema.safeParse(value).success;
    });
    const routes: RouteDefinition[] = [
      {
        ...createRoute({ heading: "One" }),
        sections: ["one", "two", "three"].map((id) => ({
          id,
          template: "fixture:counted",
          content: { heading: id },
        })),
      },
    ];
    const pipelineContext = createPipelineContext(routes);
    pipelineContext.services.getViewTemplate = (
      name,
    ): SiteViewTemplate | undefined =>
      name === "fixture:counted"
        ? {
            name,
            pluginId: "fixture",
            schema: countedSchema,
            renderers: { web: (): ReactElement => h("div", {}) },
          }
        : undefined;

    await prepareSiteBuild({
      buildId: "yielding-build",
      preparedAt: "2026-07-22T00:00:00.000Z",
      routes,
      publicDir: missingPublicDir,
      signal: new AbortController().signal,
      parsedOptions: {
        environment: "preview",
        siteConfig: { title: "Fixture Site", description: "Fixture" },
      },
      buildOptions: {},
      pipelineContext,
      imageBuildService,
      siteMetadata: { title: "Fixture Site", description: "Fixture" },
    });

    // Each section's work ends before the next starts, with the loop in between.
    expect(order.slice(0, 5)).toEqual([
      "section",
      "tick",
      "section",
      "tick",
      "section",
    ]);
  });

  it("recursively omits undefined object properties at the JSON boundary", async () => {
    const routes = [
      createRoute({
        heading: "Draft newsletter",
        sentAt: undefined,
        scheduledFor: undefined,
        sourceEntities: undefined,
        nested: { value: undefined },
      }),
    ];

    const result = await prepareSiteBuild({
      buildId: "undefined-content-build",
      preparedAt: "2026-07-22T00:00:00.000Z",
      routes,
      publicDir: missingPublicDir,
      signal: new AbortController().signal,
      parsedOptions: {
        environment: "preview",
        siteConfig: {
          title: "Fixture Site",
          description: "Fixture description",
        },
      },
      buildOptions: {},
      pipelineContext: createPipelineContext(routes),
      imageBuildService,
      siteMetadata: {
        title: "Fixture Site",
        description: "Fixture description",
      },
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.preparedBuild.routes[0]?.sections[0]?.data).toEqual({
      heading: "Draft newsletter",
      pageTitle: "Home Route",
      pageLabel: "Home Label",
      nested: {},
    });
  });

  it("rejects unsupported non-JSON values without verbose schema dumps", async () => {
    const routes = [
      createRoute({
        heading: "Unsupported content",
        unsupported: new Date("2026-07-22T00:00:00.000Z"),
      }),
    ];

    const result = await prepareSiteBuild({
      buildId: "unsupported-content-build",
      preparedAt: "2026-07-22T00:00:00.000Z",
      routes,
      publicDir: missingPublicDir,
      signal: new AbortController().signal,
      parsedOptions: {
        environment: "preview",
        siteConfig: {
          title: "Fixture Site",
          description: "Fixture description",
        },
      },
      buildOptions: {},
      pipelineContext: createPipelineContext(routes),
      imageBuildService,
      siteMetadata: {
        title: "Fixture Site",
        description: "Fixture description",
      },
    });

    expect(result.preparedBuild.routes[0]?.sections).toEqual([]);
    expect(result.diagnostics[0]?.message).toContain(
      "Unsupported non-JSON value at $.unsupported: Date",
    );
    expect(result.diagnostics[0]?.message.length).toBeLessThan(300);
  });

  it("reports invalid section content and omits it from the prepared route", async () => {
    const routes = [createRoute({ heading: 42 })];
    const pipelineContext = createPipelineContext(routes);

    const result = await prepareSiteBuild({
      buildId: "invalid-content-build",
      preparedAt: "2026-07-22T00:00:00.000Z",
      routes,
      publicDir: missingPublicDir,
      signal: new AbortController().signal,
      parsedOptions: {
        environment: "production",
        siteConfig: {
          title: "Fixture Site",
          description: "Fixture description",
        },
      },
      buildOptions: {},
      pipelineContext,
      imageBuildService,
      siteMetadata: {
        title: "Fixture Site",
        description: "Fixture description",
      },
    });

    expect(result.preparedBuild.routes[0]?.sections).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: "warning",
        code: "invalid-section-content",
        routeId: "home",
        sectionId: "hero",
        template: "fixture:hero",
      }),
    ]);
  });

  it("reports content resolution failures without rejecting preparation", async () => {
    const route = createRoute(undefined);
    route.sections[0] = {
      id: "hero",
      template: "fixture:hero",
      dataQuery: { entityType: "post" },
    };
    const pipelineContext = createPipelineContext([route]);
    pipelineContext.services.resolveTemplateContent = mock(async () => {
      throw new Error("datasource unavailable");
    });

    const result = await prepareSiteBuild({
      buildId: "resolution-failure-build",
      preparedAt: "2026-07-22T00:00:00.000Z",
      routes: [route],
      publicDir: missingPublicDir,
      signal: new AbortController().signal,
      parsedOptions: {
        environment: "production",
        siteConfig: {
          title: "Fixture Site",
          description: "Fixture description",
        },
      },
      buildOptions: {},
      pipelineContext,
      imageBuildService,
      siteMetadata: {
        title: "Fixture Site",
        description: "Fixture description",
      },
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "section-content-resolution-failed",
        message: expect.stringContaining("datasource unavailable"),
      }),
    ]);
  });

  it("snapshots binary public assets and reports inline overrides", async () => {
    const testDir = await fs.mkdtemp(join(tmpdir(), "prepared-public-assets-"));
    testDirectories.push(testDir);
    const publicDir = join(testDir, "public");
    await fs.mkdir(join(publicDir, "icons"), { recursive: true });
    await fs.writeFile(join(publicDir, "favicon.bin"), Buffer.from([0, 1, 2]));
    await fs.writeFile(join(publicDir, "icons", "mark.svg"), "<svg />");
    const pipelineContext = createPipelineContext([]);

    const result = await prepareSiteBuild({
      buildId: "public-assets-build",
      preparedAt: "2026-07-22T00:00:00.000Z",
      routes: [],
      publicDir,
      signal: new AbortController().signal,
      parsedOptions: {
        environment: "preview",
        siteConfig: {
          title: "Fixture Site",
          description: "Fixture description",
        },
      },
      buildOptions: {
        staticAssets: { "/favicon.bin": "inline override" },
      },
      pipelineContext,
      imageBuildService,
      siteMetadata: {
        title: "Fixture Site",
        description: "Fixture description",
      },
    });

    expect(result.preparedBuild.publicAssets).toEqual({
      "favicon.bin": "AAEC",
      "icons/mark.svg": Buffer.from("<svg />").toString("base64"),
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: "warning",
        code: "static-asset-collision",
        path: "/favicon.bin",
      }),
    ]);
  });

  it("reports public asset snapshot failures before rendering", async () => {
    const testDir = await fs.mkdtemp(join(tmpdir(), "unsafe-public-assets-"));
    testDirectories.push(testDir);
    const publicDir = join(testDir, "public");
    await fs.mkdir(publicDir);
    await fs.symlink("../outside.txt", join(publicDir, "linked.txt"));

    const result = await prepareSiteBuild({
      buildId: "invalid-public-assets-build",
      preparedAt: "2026-07-22T00:00:00.000Z",
      routes: [],
      publicDir,
      signal: new AbortController().signal,
      parsedOptions: {
        environment: "preview",
        siteConfig: {
          title: "Fixture Site",
          description: "Fixture description",
        },
      },
      buildOptions: {},
      pipelineContext: createPipelineContext([]),
      imageBuildService,
      siteMetadata: {
        title: "Fixture Site",
        description: "Fixture description",
      },
    });

    expect(result.preparedBuild.publicAssets).toEqual({});
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "public-asset-snapshot-failed",
        message: expect.stringContaining("cannot be a symbolic link"),
        path: publicDir,
      }),
    ]);
  });

  it("gives a build that brings no icon the lantern, and leaves a site's own icon alone", async () => {
    const routes = [createRoute({ heading: "Prepared heading" })];
    const prepare = (
      staticAssets: Record<string, string>,
    ): ReturnType<typeof prepareSiteBuild> =>
      prepareSiteBuild({
        buildId: "icon-build",
        preparedAt: "2026-07-22T00:00:00.000Z",
        routes,
        publicDir: missingPublicDir,
        signal: new AbortController().signal,
        parsedOptions: {
          environment: "preview",
          siteConfig: {
            title: "Fixture Site",
            description: "Fixture description",
            themeMode: "dark",
          },
        },
        buildOptions: { staticAssets },
        pipelineContext: createPipelineContext(routes),
        imageBuildService,
        siteMetadata: {
          title: "Fixture Site",
          description: "Fixture description",
          themeMode: "dark",
        },
      });

    const bare = await prepare({});
    expect(bare.preparedBuild.staticAssets["/favicon.svg"]).toBe(
      DEFAULT_FAVICON_SVG,
    );

    const own = await prepare({ "/favicon.svg": "<svg>own</svg>" });
    expect(own.preparedBuild.staticAssets["/favicon.svg"]).toBe(
      "<svg>own</svg>",
    );
  });
});
