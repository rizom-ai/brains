import type { SectionDefinition } from "@brains/site-composition";
import { EntityUrlGenerator } from "@brains/utils";
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

/**
 * Resolve content for a route section, either from provided content,
 * DataSource-backed dynamic content, or persisted site-content fallback.
 */
export async function resolveSiteSectionContent(
  section: SectionDefinition,
  route: { id: string },
  publishedOnly: boolean,
  options: SiteContentResolverOptions,
): Promise<unknown> {
  // If no template, only static content is possible
  if (!section.template) {
    return section.content ?? null;
  }

  const templateName = section.template;
  const urlGenerator = EntityUrlGenerator.getInstance();

  // Check if this section uses dynamic content (DataSource)
  if (section.dataQuery) {
    // Use the content resolver with DataSource params.
    // DataSource will handle any necessary transformations internally.
    const resolutionOptions: SiteContentResolutionOptions = {
      // Parameters for DataSource fetch
      dataParams: section.dataQuery,
      // Static fallback content from section definition
      fallback: section.content,
      // Filter to published-only content in production builds
      publishedOnly,
    };

    const content = await options.services.resolveTemplateContent(
      templateName,
      resolutionOptions,
    );

    // Auto-enrich data with URLs, typeLabels, and coverImageUrls
    if (content) {
      return enrichWithUrls(content, {
        entityService: options.services.entityService,
        entityDisplay: options.entityDisplay,
        imageBuildService: options.imageBuildService,
        urlGenerator,
      });
    }

    return null;
  }

  // Resolve persisted site content with static route content as fallback.
  const content = await options.services.resolveTemplateContent(templateName, {
    savedContent: {
      entityType: "site-content",
      entityId: `${route.id}:${section.id}`,
    },
    fallback: section.content,
  });

  // Auto-enrich data with URLs, typeLabels, and coverImageUrls
  if (content) {
    return enrichWithUrls(content, {
      entityService: options.services.entityService,
      entityDisplay: options.entityDisplay,
      imageBuildService: options.imageBuildService,
      urlGenerator,
    });
  }

  return null;
}
