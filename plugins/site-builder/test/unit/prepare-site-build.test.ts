import { createMockServicePluginContext } from "@brains/plugins/test";
import { afterEach, describe, expect, it, mock } from "bun:test";
import type { BuildRoute } from "../../src/lib/collect-build-routes";
import {
  DEFAULT_FAVICON_SVG,
  ROUTE_CONCURRENCY,
  RouteRegistry,
  type JsonObject,
  type PreparedRoute,
  type PreparedSiteEnvelope,
  type ResolvedSiteImage,
  type SiteImageLookup,
  type SiteImageMap,
} from "@brains/site-engine";
import { createSilentLogger } from "@brains/test-utils";
import { sha256Hex } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";
import { createElement as h, type ReactElement } from "react";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { BuildPipelineContext } from "../../src/lib/build-pipeline-context";
import {
  prepareSiteBuild,
  type PreparedPages,
  type PrepareSiteBuildOptions,
} from "../../src/lib/prepare-site-build";
import { fingerprintPreparedRoute } from "../../src/lib/site-input-fingerprint";
import type { SiteBuildDiagnostic } from "../../src/types/site-builder-types";
import { createSiteBuilderServices } from "../test-helpers";
import type { SiteBuildProfile } from "../../src/lib/site-build-profile-service";

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

function createPipelineContext(routes: BuildRoute[]): BuildPipelineContext {
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

function createRoute(content: unknown): BuildRoute {
  return {
    id: "home",
    path: "/",
    language: "en",
    alternates: [{ language: "en", path: "/" }],
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

/** Prepare a build and visit every page as a renderer would, keeping the
 *  pages handed over in route order. */
async function prepareAll(options: PrepareSiteBuildOptions): Promise<{
  preparedBuild: PreparedSiteEnvelope & { routes: PreparedRoute[] };
  diagnostics: SiteBuildDiagnostic[];
  pages: PreparedPages;
}> {
  const prepared = await prepareSiteBuild(options);
  const visited: PreparedRoute[] = [];
  await prepared.routes.each(async (route) => {
    visited.push(route);
  }, options.signal);
  const order = options.routes.map((route) => route.id);
  const pages = prepared.pages();
  return {
    preparedBuild: {
      ...prepared.envelope,
      routes: visited.sort(
        (left, right) => order.indexOf(left.id) - order.indexOf(right.id),
      ),
    },
    diagnostics: [...prepared.diagnostics, ...pages.diagnostics],
    pages,
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

    const result = await prepareAll({
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

    const result = await prepareAll({
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

    const result = await prepareAll({
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

    // The page failed to prepare, so it is never handed to the renderer.
    expect(result.preparedBuild.routes).toEqual([]);
    expect(result.diagnostics[0]?.severity).toBe("error");
    expect(result.diagnostics[0]?.message).toContain(
      "Unsupported non-JSON value at $.unsupported: Date",
    );
    expect(result.diagnostics[0]?.message.length).toBeLessThan(300);
  });

  it("reports invalid section content and omits it from the prepared route", async () => {
    const routes = [createRoute({ heading: 42 })];
    const pipelineContext = createPipelineContext(routes);

    const result = await prepareAll({
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

    const result = await prepareAll({
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
    // A page that failed to prepare is never handed to the renderer.
    expect(result.preparedBuild.routes).toEqual([]);
  });

  it("snapshots binary public assets and reports inline overrides", async () => {
    const testDir = await fs.mkdtemp(join(tmpdir(), "prepared-public-assets-"));
    testDirectories.push(testDir);
    const publicDir = join(testDir, "public");
    await fs.mkdir(join(publicDir, "icons"), { recursive: true });
    await fs.writeFile(join(publicDir, "favicon.bin"), Buffer.from([0, 1, 2]));
    await fs.writeFile(join(publicDir, "icons", "mark.svg"), "<svg />");
    const pipelineContext = createPipelineContext([]);

    const result = await prepareAll({
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

    const result = await prepareAll({
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
    ): ReturnType<typeof prepareAll> =>
      prepareAll({
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

  function sourceOptions(
    routes: BuildRoute[],
    pipelineContext: BuildPipelineContext = createPipelineContext(routes),
  ): PrepareSiteBuildOptions {
    return {
      buildId: "source-build",
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
    };
  }

  function manyRoutes(count: number): BuildRoute[] {
    return Array.from({ length: count }, (_, index) => ({
      ...createRoute({ heading: `page ${index}` }),
      id: `page-${index}`,
      path: `/page-${index}`,
    }));
  }

  it("prepares a page only as it is visited, a few at a time", async () => {
    const routes = manyRoutes(12);
    let prepared = 0;
    let finished = 0;
    let mostHeld = 0;
    // Each page has one section, resolved once as the page is prepared.
    const pipelineContext = createPipelineContext(routes);
    pipelineContext.services.resolveTemplateContent = async (
      _templateName,
      resolution,
    ): Promise<unknown> => {
      prepared++;
      return resolution?.fallback;
    };
    const source = await prepareSiteBuild(
      sourceOptions(routes, pipelineContext),
    );

    expect(prepared).toBe(0);
    await source.routes.each(async () => {
      mostHeld = Math.max(mostHeld, prepared - finished);
      await new Promise<void>((resolve) => setImmediate(resolve));
      finished++;
    }, new AbortController().signal);

    expect(source.routes.count).toBe(12);
    expect(finished).toBe(12);
    expect(mostHeld).toBeLessThanOrEqual(ROUTE_CONCURRENCY);
  });

  it("leaves of each page its summary and digest, in route order", async () => {
    const routes = manyRoutes(6);
    const source = await prepareSiteBuild(sourceOptions(routes));
    const visited = new Map<string, PreparedRoute>();
    await source.routes.each(async (route) => {
      visited.set(route.id, route);
    }, new AbortController().signal);
    const pages = source.pages();

    expect(pages.routes.map((route) => route.id)).toEqual(
      routes.map((route) => route.id),
    );
    expect(pages.routes[0]).toEqual({
      id: "page-0",
      path: "/page-0",
      headScripts: visited.get("page-0")?.headScripts ?? [],
    });
    expect(pages.digests).toEqual(
      routes.map((route) => {
        const page = visited.get(route.id);
        if (!page) throw new Error(`Expected ${route.id} to be visited`);
        return fingerprintPreparedRoute(page);
      }),
    );
    expect(pages.templates).toEqual(["fixture:hero"]);
  });
});
