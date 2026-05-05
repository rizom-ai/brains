import type {
  RouteDefinition,
  SectionDefinition,
  SiteLayoutInfo,
  SiteMetadata,
} from "@brains/site-composition";
import type { SiteImageBuildService } from "@brains/site-engine";
import type { SiteBuilderOptions } from "../types/site-builder-types";
import type { BuildContext } from "./static-site-builder";
import type { BuildPipelineContext } from "./build-pipeline-context";
import type { SiteViewTemplate } from "./site-view-template";
import { buildSiteLayoutInfo } from "./build-site-layout-info";
import { resolveSiteSectionContent } from "./content-resolver";

export interface CreateBuildContextOptions {
  routes: RouteDefinition[];
  parsedOptions: Pick<
    SiteBuilderOptions,
    "environment" | "siteConfig" | "layouts" | "themeCSS"
  >;
  buildOptions: Pick<
    SiteBuilderOptions,
    "headScripts" | "staticAssets" | "slots"
  >;
  pipelineContext: BuildPipelineContext;
  imageBuildService: SiteImageBuildService;
  siteMetadata: SiteMetadata;
}

export function createBuildContext(
  options: CreateBuildContextOptions,
): BuildContext {
  return {
    routes: options.routes,
    siteConfig: {
      title: options.siteMetadata.title,
      description: options.siteMetadata.description,
      ...(options.siteMetadata.url && { url: options.siteMetadata.url }),
      ...(options.siteMetadata.copyright && {
        copyright: options.siteMetadata.copyright,
      }),
      ...(options.siteMetadata.themeMode && {
        themeMode: options.siteMetadata.themeMode,
      }),
      ...(options.siteMetadata.analyticsScript && {
        analyticsScript: options.siteMetadata.analyticsScript,
      }),
    },
    headScripts: options.buildOptions.headScripts,
    ...(options.buildOptions.staticAssets && {
      staticAssets: options.buildOptions.staticAssets,
    }),
    getContent: async (
      route: RouteDefinition,
      section: SectionDefinition,
    ): Promise<unknown> => {
      // In production, filter to only published content.
      // In preview (or unspecified), show all content including drafts.
      const publishedOnly = options.parsedOptions.environment === "production";
      return resolveSiteSectionContent(section, route, publishedOnly, {
        pipelineContext: options.pipelineContext,
        imageBuildService: options.imageBuildService,
      });
    },
    getViewTemplate: (name: string): SiteViewTemplate | undefined => {
      return options.pipelineContext.services.getViewTemplate(name);
    },
    layouts: options.parsedOptions.layouts,
    getSiteLayoutInfo: async (): Promise<SiteLayoutInfo> => {
      return buildSiteLayoutInfo(
        options.siteMetadata,
        options.pipelineContext.profileService,
        options.pipelineContext.routeRegistry,
      );
    },
    ...(options.parsedOptions.themeCSS !== undefined && {
      themeCSS: options.parsedOptions.themeCSS,
    }),
    ...(options.buildOptions.slots && { slots: options.buildOptions.slots }),
    imageBuildService: options.imageBuildService,
  };
}
