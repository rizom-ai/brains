import { h } from "preact";
import { promises as fs } from "fs";
import type { SiteBuilderConfig } from "../src/config";
import type { SiteBuilderServices } from "../src/lib/site-builder";
import type { BuildContext } from "../src/lib/static-site-builder";
import type { SiteViewTemplate } from "../src/lib/site-view-template";
import type {
  SiteBuildOutputCommitResult,
  SiteBuildOutputLifecycle,
  SiteBuildOutputTarget,
} from "../src/lib/site-build-output-lifecycle";
import type { ServicePluginContext } from "@brains/plugins";
import type {
  RouteDefinition,
  SiteLayoutInfo,
  SiteMetadata,
} from "@brains/site-composition";
import {
  collectRouteAssets,
  collectRouteScripts,
  jsonObjectSchema,
  type LayoutComponent,
  type LayoutSlots,
  type SiteImageMap,
} from "@brains/site-engine";

type SiteBuilderConfigOverrides = Partial<SiteBuilderConfig>;

/**
 * Minimal layout for testing
 */
export const TestLayout: LayoutComponent = ({ sections }) => {
  return h("main", {}, sections);
};

interface CreateRendererTestContextOptions {
  routes: RouteDefinition[];
  siteConfig: SiteMetadata;
  siteLayoutInfo: SiteLayoutInfo;
  getViewTemplate(name: string): SiteViewTemplate | undefined;
  layouts: Record<string, LayoutComponent>;
  themeCSS?: string;
  headScripts?: string[];
  staticAssets?: Record<string, string>;
  publicAssets?: Record<string, string>;
  images?: SiteImageMap;
  slots?: LayoutSlots;
}

/** Prepare inline fixture content for renderer-only unit tests. */
export interface RendererTestSourceContext {
  routes: RouteDefinition[];
  siteConfig: SiteMetadata;
  getContent(
    route: RouteDefinition,
    section: RouteDefinition["sections"][0],
  ): Promise<unknown>;
  getViewTemplate(name: string): SiteViewTemplate | undefined;
  layouts: Record<string, LayoutComponent>;
  getSiteLayoutInfo(): Promise<SiteLayoutInfo>;
  themeCSS?: string;
  headScripts?: string[];
  staticAssets?: Record<string, string>;
  publicAssets?: Record<string, string>;
  images?: SiteImageMap;
  slots?: LayoutSlots;
}

/** Adapt legacy inline renderer fixtures through the new preparation seam. */
export async function prepareRendererTestContext(
  source: RendererTestSourceContext,
): Promise<BuildContext> {
  const routes = await Promise.all(
    source.routes.map(async (route) => ({
      ...route,
      sections: await Promise.all(
        route.sections.map(async (section) => ({
          ...section,
          content: await source.getContent(route, section),
        })),
      ),
    })),
  );

  return createRendererTestContext({
    routes,
    siteConfig: source.siteConfig,
    siteLayoutInfo: await source.getSiteLayoutInfo(),
    getViewTemplate: source.getViewTemplate,
    layouts: source.layouts,
    ...(source.themeCSS !== undefined && { themeCSS: source.themeCSS }),
    ...(source.headScripts !== undefined && {
      headScripts: source.headScripts,
    }),
    ...(source.staticAssets !== undefined && {
      staticAssets: source.staticAssets,
    }),
    ...(source.publicAssets !== undefined && {
      publicAssets: source.publicAssets,
    }),
    ...(source.images !== undefined && { images: source.images }),
    ...(source.slots !== undefined && { slots: source.slots }),
  });
}

export function createRendererTestContext(
  options: CreateRendererTestContextOptions,
): BuildContext {
  const preparedRoutes = options.routes.map((route) => ({
    id: route.id,
    path: route.path,
    title: route.title,
    ...(route.pageLabel !== undefined && { pageLabel: route.pageLabel }),
    description: route.description,
    layout: route.layout,
    fullscreen: route.sections.some(
      (section) =>
        options.getViewTemplate(section.template)?.fullscreen === true,
    ),
    sections: route.sections.flatMap((section) => {
      if (section.template === "footer") return [];
      const template = options.getViewTemplate(section.template);
      if (typeof template?.renderers.web !== "function" || !section.content) {
        return [];
      }
      const data = jsonObjectSchema.parse(
        template.schema.parse({
          ...jsonObjectSchema.parse(section.content),
          pageTitle: route.title || options.siteConfig.title,
          ...(route.pageLabel !== undefined && {
            pageLabel: route.pageLabel,
          }),
        }),
      );
      return [{ id: section.id, template: section.template, data }];
    }),
    headScripts: collectRouteScripts(route, {
      getViewTemplate: options.getViewTemplate,
    }),
  }));
  const viewTemplates = Object.fromEntries(
    preparedRoutes
      .flatMap((route) => route.sections)
      .flatMap((section) => {
        const template = options.getViewTemplate(section.template);
        return template ? [[section.template, template] as const] : [];
      }),
  );

  return {
    preparedBuild: {
      buildId: "renderer-test-build",
      environment: "preview",
      site: { ...options.siteConfig, ...options.siteLayoutInfo },
      routes: preparedRoutes,
      ...(options.themeCSS !== undefined && { themeCSS: options.themeCSS }),
      images: options.images ?? {},
      staticAssets: {
        ...collectRouteAssets(options.routes, {
          getViewTemplate: options.getViewTemplate,
        }),
        ...options.staticAssets,
      },
      publicAssets: options.publicAssets ?? {},
      globalHeadScripts: options.headScripts ?? [],
    },
    viewTemplates,
    layouts: options.layouts,
    ...(options.slots && { slots: options.slots }),
  };
}

/**
 * Create a test config with minimal required fields
 */
export function createTestSiteBuildOutputLifecycle(): SiteBuildOutputLifecycle {
  return {
    begin: async (options): Promise<SiteBuildOutputTarget> => {
      const generationDir = `${options.outputDir}.generation-${options.buildId}`;
      await fs.mkdir(generationDir, { recursive: true });
      return {
        activeOutputDir: options.outputDir,
        generationDir,
        workingDir: `${options.outputDir}.working-${options.buildId}`,
        environmentDir: `${options.outputDir}.generations`,
        buildId: options.buildId,
      };
    },
    commit: async (options): Promise<SiteBuildOutputCommitResult> => {
      await fs.rm(options.target.generationDir, {
        recursive: true,
        force: true,
      });
      return {
        filesGenerated: options.preparedBuild.routes.length + 1,
        manifestPath: `${options.target.activeOutputDir}/.site-build-manifest.json`,
        manifest: {
          version: 1,
          buildId: options.preparedBuild.buildId,
          environment: options.preparedBuild.environment,
          routes: [],
          files: [],
          images: options.preparedBuild.images,
          staticAssets: [],
          publicAssets: [],
          scripts: { global: [], byRoute: {} },
          warnings: options.warnings,
        },
      };
    },
    abort: async (target): Promise<void> => {
      await fs.rm(target.generationDir, { recursive: true, force: true });
    },
  };
}

export function createSiteBuilderServices(
  context: ServicePluginContext,
): SiteBuilderServices {
  return {
    entityService: context.entityService,
    sendMessage: context.messaging.send,
    resolveTemplateContent: (templateName, options) =>
      context.templates.resolve(templateName, options),
    getViewTemplate: (name) => context.views.get(name),
    listViewTemplateNames: (): string[] =>
      context.views.list().map((template) => template.name),
  };
}

export function createTestConfig(
  overrides?: SiteBuilderConfigOverrides,
): SiteBuilderConfig {
  const defaultConfig: SiteBuilderConfig = {
    previewOutputDir: "./dist/site-preview",
    productionOutputDir: "./dist/site-production",
    sharedImagesDir: "./dist/images",
    workingDir: "./.preact-work",
    siteInfo: {
      title: "Test Site",
      description: "Test site for unit tests",
    },
    layouts: {
      default: TestLayout,
    },
    autoRebuild: false, // Disabled for tests
    rebuildDebounce: 5000,
  };

  return {
    ...defaultConfig,
    ...overrides,
  };
}
