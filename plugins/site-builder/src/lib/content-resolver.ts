import type { SectionDefinition } from "@brains/site-composition";
import type { SiteImageLookup } from "@brains/site-engine";
import { EntityUrlGenerator } from "@brains/utils";
import { enrichWithUrls } from "./content-enrichment";
import type { SiteContentResolutionOptions } from "./site-content-contracts";
import type { BuildPipelineContext } from "./build-pipeline-context";

export interface SiteContentResolverOptions {
  pipelineContext: Pick<BuildPipelineContext, "services" | "entityDisplay">;
  imageBuildService?: SiteImageLookup | null | undefined;
}

export async function resolveSiteSectionContent(
  section: SectionDefinition,
  route: { id: string },
  publishedOnly: boolean,
  options: SiteContentResolverOptions,
): Promise<unknown> {
  if (!section.template) {
    return section.content ?? null;
  }

  const templateName = section.template;
  const resolutionOptions: SiteContentResolutionOptions = section.dataQuery
    ? {
        dataParams: section.dataQuery,
        fallback: section.content,
        publishedOnly,
      }
    : {
        savedContent: {
          entityType: "site-content",
          entityId: `${route.id}:${section.id}`,
        },
        fallback: section.content,
      };

  const content = await options.pipelineContext.services.resolveTemplateContent(
    templateName,
    resolutionOptions,
  );
  if (!content) {
    return null;
  }

  return enrichWithUrls(content, {
    pipelineContext: options.pipelineContext,
    imageBuildService: options.imageBuildService,
    urlGenerator: EntityUrlGenerator.getInstance(),
  });
}
