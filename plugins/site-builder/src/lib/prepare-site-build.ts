import type {
  RouteDefinition,
  SectionDefinition,
  SiteMetadata,
} from "@brains/site-composition";
import {
  collectRouteAssets,
  collectRouteScripts,
  createPreparedSiteBuildSnapshot,
  jsonObjectSchema,
  type PreparedRoute,
  type PreparedSection,
  type PreparedSiteBuild,
  type SiteImageLookup,
  type SiteImageMap,
} from "@brains/site-engine";
import { getErrorMessage } from "@brains/utils/error";
import { pLimit } from "@brains/utils/p-limit";
import { z } from "@brains/utils/zod";
import type {
  SiteBuildDiagnostic,
  SiteBuilderOptions,
} from "../types/site-builder-types";
import { buildSiteLayoutInfo } from "./build-site-layout-info";
import type { BuildPipelineContext } from "./build-pipeline-context";
import { resolveSiteSectionContent } from "./content-resolver";
import type { SiteViewTemplate } from "./site-view-template";
import { snapshotPublicAssets } from "./snapshot-public-assets";

const sectionContentSchema = z.record(z.string(), z.unknown());

export interface PrepareSiteBuildOptions {
  buildId: string;
  preparedAt: string;
  routes: RouteDefinition[];
  parsedOptions: Pick<
    SiteBuilderOptions,
    "environment" | "siteConfig" | "themeCSS"
  >;
  buildOptions: Pick<SiteBuilderOptions, "headScripts" | "staticAssets">;
  pipelineContext: BuildPipelineContext;
  imageBuildService: SiteImageLookup & { getMap(): SiteImageMap };
  siteMetadata: SiteMetadata;
  publicDir: string;
  signal: AbortSignal;
}

export interface PrepareSiteBuildResult {
  preparedBuild: PreparedSiteBuild;
  diagnostics: SiteBuildDiagnostic[];
}

interface PreparedRouteResult {
  route: PreparedRoute;
  diagnostics: SiteBuildDiagnostic[];
}

/** Resolve and validate every route section before renderer execution begins. */
export async function prepareSiteBuild(
  options: PrepareSiteBuildOptions,
): Promise<PrepareSiteBuildResult> {
  options.signal.throwIfAborted();
  const getViewTemplate = (name: string): SiteViewTemplate | undefined =>
    options.pipelineContext.services.getViewTemplate(name);
  const publishedOnly = options.parsedOptions.environment === "production";
  const diagnostics: SiteBuildDiagnostic[] = [];
  let publicAssets: Record<string, string> = {};
  try {
    publicAssets = await snapshotPublicAssets(
      options.publicDir,
      options.signal,
    );
  } catch (error) {
    options.signal.throwIfAborted();
    const diagnostic: SiteBuildDiagnostic = {
      severity: "error",
      code: "public-asset-snapshot-failed",
      message: `Failed to snapshot app public assets: ${getErrorMessage(error)}`,
      path: options.publicDir,
    };
    options.pipelineContext.logger.error(diagnostic.message, { error });
    diagnostics.push(diagnostic);
  }

  const limit = pLimit(4);
  const settledRouteResults = await Promise.allSettled(
    options.routes.map((route) =>
      limit(() => {
        options.signal.throwIfAborted();
        return prepareRoute({
          route,
          siteTitle: options.siteMetadata.title,
          publishedOnly,
          getViewTemplate,
          pipelineContext: options.pipelineContext,
          imageBuildService: options.imageBuildService,
          siteUrl: options.siteMetadata.url,
          signal: options.signal,
        });
      }),
    ),
  );
  options.signal.throwIfAborted();
  const rejectedRoute = settledRouteResults.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (rejectedRoute) throw rejectedRoute.reason;
  const routeResults = settledRouteResults.map(
    (result) => (result as PromiseFulfilledResult<PreparedRouteResult>).value,
  );

  const site = buildSiteLayoutInfo(
    options.siteMetadata,
    options.pipelineContext.profileService,
    options.pipelineContext.routeRegistry,
  );
  const staticAssets = {
    ...collectRouteAssets(options.routes, { getViewTemplate }),
    ...options.buildOptions.staticAssets,
  };
  const publicAssetPaths = new Set(Object.keys(publicAssets));
  for (const staticAssetPath of Object.keys(staticAssets)) {
    const path = staticAssetPath.startsWith("/")
      ? staticAssetPath.slice(1)
      : staticAssetPath;
    if (!publicAssetPaths.has(path)) continue;
    diagnostics.push({
      severity: "warning",
      code: "static-asset-collision",
      message: `Static asset "${staticAssetPath}" overrides app public asset "${path}"`,
      path: staticAssetPath,
    });
  }
  options.signal.throwIfAborted();
  const preparedBuild = createPreparedSiteBuildSnapshot({
    buildId: options.buildId,
    preparedAt: options.preparedAt,
    environment: options.parsedOptions.environment,
    site,
    routes: routeResults.map((result) => result.route),
    ...(options.parsedOptions.themeCSS !== undefined && {
      themeCSS: options.parsedOptions.themeCSS,
    }),
    images: options.imageBuildService.getMap(),
    staticAssets,
    publicAssets,
    globalHeadScripts: options.buildOptions.headScripts ?? [],
  });

  return {
    preparedBuild,
    diagnostics: [
      ...diagnostics,
      ...routeResults.flatMap((result) => result.diagnostics),
    ],
  };
}

interface PrepareRouteOptions {
  route: RouteDefinition;
  siteTitle: string;
  publishedOnly: boolean;
  getViewTemplate(name: string): SiteViewTemplate | undefined;
  pipelineContext: BuildPipelineContext;
  imageBuildService: SiteImageLookup;
  siteUrl: string | undefined;
  signal: AbortSignal;
}

async function prepareRoute(
  options: PrepareRouteOptions,
): Promise<PreparedRouteResult> {
  options.signal.throwIfAborted();
  const diagnostics: SiteBuildDiagnostic[] = [];
  const sections: PreparedSection[] = [];

  for (const section of options.route.sections) {
    options.signal.throwIfAborted();
    if (section.template === "footer") continue;

    const result = await prepareSection(options, section);
    if (result.section) sections.push(result.section);
    if (result.diagnostic) diagnostics.push(result.diagnostic);
  }

  return {
    route: {
      id: options.route.id,
      path: options.route.path,
      title: options.route.title,
      ...(options.route.pageLabel !== undefined && {
        pageLabel: options.route.pageLabel,
      }),
      description: options.route.description,
      layout: options.route.layout,
      fullscreen: options.route.sections.some(
        (section) =>
          options.getViewTemplate(section.template)?.fullscreen === true,
      ),
      sections,
      headScripts: collectRouteScripts(options.route, {
        getViewTemplate: options.getViewTemplate,
      }),
    },
    diagnostics,
  };
}

interface PreparedSectionResult {
  section?: PreparedSection;
  diagnostic?: SiteBuildDiagnostic;
}

async function prepareSection(
  options: PrepareRouteOptions,
  section: SectionDefinition,
): Promise<PreparedSectionResult> {
  options.signal.throwIfAborted();
  const template = options.getViewTemplate(section.template);
  const renderer = template?.renderers.web;
  // Missing templates / renderers are already surfaced as structured
  // diagnostics by the preflight pass, which runs before preparation. Skip the
  // section here rather than double-reporting the same warning.
  if (!template || !renderer || typeof renderer !== "function") return {};

  let content: unknown;
  try {
    content = await resolveSiteSectionContent(
      section,
      options.route,
      options.publishedOnly,
      "public",
      {
        pipelineContext: options.pipelineContext,
        imageBuildService: options.imageBuildService,
        siteUrl: options.siteUrl,
      },
    );
    options.signal.throwIfAborted();
  } catch (error) {
    options.signal.throwIfAborted();
    const diagnostic: SiteBuildDiagnostic = {
      severity: "error",
      code: "section-content-resolution-failed",
      message: `Failed to resolve content for route "${options.route.id}" section "${section.id}": ${getErrorMessage(error)}`,
      routeId: options.route.id,
      sectionId: section.id,
      template: section.template,
    };
    options.pipelineContext.logger.error(diagnostic.message, { error });
    return { diagnostic };
  }

  if (!content) return {};

  options.signal.throwIfAborted();
  try {
    const contentObject = sectionContentSchema.parse(content);
    const validatedContent = sectionContentSchema.parse(
      template.schema.parse({
        ...contentObject,
        pageTitle: options.route.title || options.siteTitle,
        ...(options.route.pageLabel !== undefined && {
          pageLabel: options.route.pageLabel,
        }),
      }),
    );

    return {
      section: {
        id: section.id,
        template: section.template,
        data: jsonObjectSchema.parse(validatedContent),
      },
    };
  } catch (error) {
    const diagnostic: SiteBuildDiagnostic = {
      severity: "warning",
      code: "invalid-section-content",
      message: `Route "${options.route.id}" section "${section.id}" has invalid content for template "${section.template}": ${getErrorMessage(error)}`,
      routeId: options.route.id,
      sectionId: section.id,
      template: section.template,
    };
    options.pipelineContext.logger.error(diagnostic.message, { error });
    return { diagnostic };
  }
}
