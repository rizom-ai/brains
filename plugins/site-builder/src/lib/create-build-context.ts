import type { RouteDefinition } from "@brains/site-composition";
import type {
  PreparedRouteSource,
  PreparedSiteEnvelope,
} from "@brains/site-engine";
import type { SiteBuilderOptions } from "../types/site-builder-types";
import type { BuildContext } from "./static-site-builder";
import type { BuildPipelineContext } from "./build-pipeline-context";
import type { SiteViewTemplate } from "./site-view-template";

export interface CreateBuildContextOptions {
  envelope: PreparedSiteEnvelope;
  routes: PreparedRouteSource;
  /** The build's route definitions, whose sections name their templates. */
  definitions: readonly RouteDefinition[];
  layouts: SiteBuilderOptions["layouts"];
  slots: SiteBuilderOptions["slots"];
  pipelineContext: BuildPipelineContext;
}

/**
 * Attach renderer-only component bindings to a build's fields and its pages.
 * The pages are prepared only as they are rendered, so the templates are
 * bound from the sections their routes define; a section whose template is
 * missing is reported by preflight and prepared as no section.
 */
export function createBuildContext(
  options: CreateBuildContextOptions,
): BuildContext {
  const templateNames = [
    ...new Set(
      options.definitions
        .flatMap((route) => route.sections)
        .map((section) => section.template),
    ),
  ];
  const viewTemplates = Object.fromEntries(
    templateNames.flatMap((name) => {
      const template: SiteViewTemplate | undefined =
        options.pipelineContext.services.getViewTemplate(name);
      return template ? [[name, template] as const] : [];
    }),
  );

  return {
    preparedBuild: options.envelope,
    routes: options.routes,
    viewTemplates,
    layouts: options.layouts,
    ...(options.slots && { slots: options.slots }),
  };
}
