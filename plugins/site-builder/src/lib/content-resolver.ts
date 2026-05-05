import type { SectionDefinition } from "@brains/site-composition";
import type { SiteImageLookup } from "@brains/site-engine";
import type { EntityDisplayMap } from "../config";
import { enrichWithUrls } from "./content-enrichment";
import type {
  SiteContentEntityService,
  SiteContentResolutionOptions,
} from "./site-content-contracts";

export interface SiteContentResolverServices {
  entityService: SiteContentEntityService;
  resolveTemplateContent: <T = unknown>(
    templateName: string,
    options?: SiteContentResolutionOptions,
  ) => Promise<T | null>;
}

export interface SiteContentResolverOptions {
  services: SiteContentResolverServices;
  entityDisplay?: EntityDisplayMap | undefined;
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

  const content = await options.services.resolveTemplateContent(
    templateName,
    resolutionOptions,
  );
  if (!content) {
    return null;
  }

  return enrichWithUrls(content, {
    entityService: options.services.entityService,
    entityDisplay: options.entityDisplay,
    imageBuildService: options.imageBuildService,
  });
}
