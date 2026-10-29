import type { SectionDefinition, SiteMetadata } from "@brains/site-composition";
import {
  collectRouteAssets,
  collectRouteScripts,
  createPreparedSiteEnvelope,
  freezePreparedRoute,
  jsonObjectSchema,
  normalizeJsonValue,
  visitEach,
  type PreparedRoute,
  type PreparedRouteSource,
  type PreparedRouteSummary,
  type PreparedSection,
  type PreparedSiteEnvelope,
  type SiteImageLookup,
  type SiteImageMap,
  withDefaultIcon,
} from "@brains/site-engine";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import type {
  SiteBuildDiagnostic,
  SiteBuilderOptions,
} from "../types/site-builder-types";
import { buildSiteLayoutInfo } from "./build-site-layout-info";
import type { BuildRoute } from "./collect-build-routes";
import type { BuildPipelineContext } from "./build-pipeline-context";
import { resolveSiteSectionContent } from "./content-resolver";
import { fingerprintPreparedRoute } from "./site-input-fingerprint";
import type { SiteViewTemplate } from "./site-view-template";
import { snapshotPublicAssets } from "./snapshot-public-assets";

const sectionContentSchema = z.record(z.string(), z.unknown());

export interface PrepareSiteBuildOptions {
  buildId: string;
  preparedAt: string;
  routes: BuildRoute[];
  parsedOptions: Pick<
    SiteBuilderOptions,
    "environment" | "siteConfig" | "themeCSS"
  >;
  buildOptions: Pick<SiteBuilderOptions, "headScripts" | "staticAssets">;
  pipelineContext: BuildPipelineContext;
  imageBuildService: SiteImageLookup & { getMap(): SiteImageMap };
  siteMetadata: SiteMetadata;
  /** The environment's public URL, for absolute links between languages. */
  siteUrl?: string | undefined;
  publicDir: string;
  signal: AbortSignal;
}

interface PreparedRouteResult {
  route: PreparedRoute;
  diagnostics: SiteBuildDiagnostic[];
}

/** What a build's pages leave behind once they are rendered. */
export interface PreparedPages {
  /** Each rendered page's summary, in route order. */
  routes: PreparedRouteSummary[];
  /** Each rendered page's renderer input as a hash, in route order. */
  digests: string[];
  /** The templates the rendered pages' sections use, sorted. */
  templates: string[];
  /** What preparing the pages reported, in route order. */
  diagnostics: SiteBuildDiagnostic[];
}

export interface PrepareSiteBuildResult {
  /** The build's fields besides its pages. */
  envelope: PreparedSiteEnvelope;
  /** What preparing the build's own fields reported: its assets. */
  diagnostics: SiteBuildDiagnostic[];
  /**
   * The pages, each prepared as it is visited and dropped once its visit
   * ends. A page whose preparation reported an error is not visited.
   */
  routes: PreparedRouteSource;
  /** What the pages left behind, once `routes.each` has run. */
  pages(): PreparedPages;
}

/**
 * Prepare a build's own fields, and its pages as a source that resolves and
 * validates each page's sections only as the renderer asks for it: a build
 * of tens of thousands of pages holds a few of them at a time.
 */
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

  // Every brain is a light: a build that brings no icon gets the lantern.
  const staticAssets = withDefaultIcon(
    {
      ...collectRouteAssets(options.routes, { getViewTemplate }),
      ...options.buildOptions.staticAssets,
    },
    Object.keys(publicAssets),
  );

  const site = buildSiteLayoutInfo(
    options.siteMetadata,
    options.pipelineContext.profileService,
    options.pipelineContext.routeRegistry,
  );
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
  const envelope = createPreparedSiteEnvelope({
    buildId: options.buildId,
    preparedAt: options.preparedAt,
    environment: options.parsedOptions.environment,
    site,
    ...(options.parsedOptions.themeCSS !== undefined && {
      themeCSS: options.parsedOptions.themeCSS,
    }),
    images: options.imageBuildService.getMap(),
    staticAssets,
    publicAssets,
    globalHeadScripts: options.buildOptions.headScripts ?? [],
    ...(options.siteUrl !== undefined && { siteUrl: options.siteUrl }),
  });

  // Each page leaves only its summary, digest and diagnostics, kept in its
  // route's place so the build's order does not depend on which page a
  // renderer finished first.
  const summaries: Array<PreparedRouteSummary | undefined> = [];
  const digests: Array<string | undefined> = [];
  const pageDiagnostics: SiteBuildDiagnostic[][] = [];
  const templates = new Set<string>();

  const routes: PreparedRouteSource = {
    count: options.routes.length,
    each: (visit, signal) =>
      visitEach(
        options.routes.map((route, index) => ({ route, index })),
        async ({ route, index }) => {
          const result = await prepareRoute({
            route,
            siteTitle: options.siteMetadata.title,
            publishedOnly,
            getViewTemplate,
            staticAssets,
            pipelineContext: options.pipelineContext,
            imageBuildService: options.imageBuildService,
            siteUrl: options.siteMetadata.url,
            signal,
          });
          pageDiagnostics[index] = result.diagnostics;
          if (result.diagnostics.some(({ severity }) => severity === "error")) {
            return;
          }
          // Each section's data was validated as JSON when it was prepared;
          // the page keeps it rather than copying it.
          const page = freezePreparedRoute(result.route);
          summaries[index] = {
            id: page.id,
            path: page.path,
            headScripts: page.headScripts,
          };
          digests[index] = fingerprintPreparedRoute(page);
          for (const section of page.sections) templates.add(section.template);
          await visit(page);
        },
        signal,
      ),
  };

  return {
    envelope,
    diagnostics,
    routes,
    pages: () => ({
      routes: summaries.filter((summary) => summary !== undefined),
      digests: digests.filter((digest) => digest !== undefined),
      templates: [...templates].sort(),
      diagnostics: pageDiagnostics.flat(),
    }),
  };
}

interface PrepareRouteOptions {
  route: BuildRoute;
  siteTitle: string;
  publishedOnly: boolean;
  getViewTemplate(name: string): SiteViewTemplate | undefined;
  staticAssets: Record<string, string>;
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
      language: options.route.language,
      alternates: options.route.alternates,
      ...(options.route.siteNavigation !== undefined && {
        siteNavigation: options.route.siteNavigation,
      }),
      ...(options.route.siteTranslation !== undefined && {
        siteTranslation: options.route.siteTranslation,
      }),
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
      headScripts: collectRouteScripts(
        options.route,
        { getViewTemplate: options.getViewTemplate },
        options.staticAssets,
      ),
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
    const resolution = formatValidationError(error);
    const diagnostic: SiteBuildDiagnostic = {
      severity: "error",
      code: "section-content-resolution-failed",
      message: `Failed to resolve content for route "${options.route.id}" section "${section.id}": ${resolution.summary}`,
      routeId: options.route.id,
      sectionId: section.id,
      template: section.template,
    };
    options.pipelineContext.logger.error(
      "Failed to resolve site section content",
      {
        routeId: options.route.id,
        sectionId: section.id,
        template: section.template,
        ...(resolution.issues ? { issues: resolution.issues } : {}),
        ...(!resolution.issues ? { error: resolution.summary } : {}),
      },
    );
    return { diagnostic };
  }

  if (!content) return {};

  options.signal.throwIfAborted();
  try {
    const contentObject = sectionContentSchema.parse(content);
    const templateContent = template.schema.parse({
      ...contentObject,
      pageTitle: options.route.title || options.siteTitle,
      ...(options.route.pageLabel !== undefined && {
        pageLabel: options.route.pageLabel,
      }),
    });
    const normalizedContent = normalizeJsonValue(templateContent);
    const validatedContent = sectionContentSchema.parse(normalizedContent);

    return {
      section: {
        id: section.id,
        template: section.template,
        data: jsonObjectSchema.parse(validatedContent),
      },
    };
  } catch (error) {
    const validation = formatValidationError(error);
    const diagnostic: SiteBuildDiagnostic = {
      severity: "warning",
      code: "invalid-section-content",
      message: `Route "${options.route.id}" section "${section.id}" has invalid content for template "${section.template}": ${validation.summary}`,
      routeId: options.route.id,
      sectionId: section.id,
      template: section.template,
    };
    options.pipelineContext.logger.error("Invalid site section content", {
      routeId: options.route.id,
      sectionId: section.id,
      template: section.template,
      ...(validation.issues ? { issues: validation.issues } : {}),
      ...(!validation.issues ? { error: validation.summary } : {}),
    });
    return { diagnostic };
  }
}

interface ValidationIssueSummary {
  code: string;
  path: string;
  message: string;
}

function formatValidationError(error: unknown): {
  summary: string;
  issues?: ValidationIssueSummary[];
} {
  if (!(error instanceof z.ZodError)) {
    return { summary: getErrorMessage(error) };
  }

  const issues = error.issues.map((issue) => ({
    code: issue.code,
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
  return {
    summary: issues
      .map((issue) => `${issue.path || "<root>"}: ${issue.message}`)
      .join("; "),
    issues,
  };
}
