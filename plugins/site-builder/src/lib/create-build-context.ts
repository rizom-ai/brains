import type { PreparedSiteBuild } from "@brains/site-engine";
import type { SiteBuilderOptions } from "../types/site-builder-types";
import type { BuildContext } from "./static-site-builder";
import type { BuildPipelineContext } from "./build-pipeline-context";

export interface CreateBuildContextOptions {
  preparedBuild: PreparedSiteBuild;
  layouts: SiteBuilderOptions["layouts"];
  slots: SiteBuilderOptions["slots"];
  pipelineContext: BuildPipelineContext;
}

/** Attach renderer-only component bindings to a serializable build snapshot. */
export function createBuildContext(
  options: CreateBuildContextOptions,
): BuildContext {
  const templateNames = [
    ...new Set(
      options.preparedBuild.routes
        .flatMap((route) => route.sections)
        .map((section) => section.template),
    ),
  ];
  const viewTemplates = Object.fromEntries(
    templateNames.map((name) => {
      const template = options.pipelineContext.services.getViewTemplate(name);
      if (!template) {
        throw new Error(`Prepared template binding not found: ${name}`);
      }
      return [name, template] as const;
    }),
  );

  return {
    preparedBuild: options.preparedBuild,
    viewTemplates,
    layouts: options.layouts,
    ...(options.slots && { slots: options.slots }),
  };
}
