import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
} from "@brains/plugins";
import { fetchAnchorProfileData } from "@brains/profile";
import type { HomepageOpeningContent } from "@brains/site-atlas";
import {
  organizationProfileSchema,
  type OrganizationProfile,
} from "../schemas/organization-profile";
import { loadAgentAtlas } from "./agent-atlas";

/**
 * The opening the anchor profile gives: its tagline over its introduction,
 * or its description. There is no door, because no contact form is known.
 */
export function openingFromProfile(
  profile: OrganizationProfile,
): HomepageOpeningContent {
  return {
    // An empty tagline counts as absent, as on the professional homepage.
    title: profile.tagline?.length ? profile.tagline : null,
    introduction: [profile.intro, profile.description].find(Boolean) ?? null,
    topics: [],
    topicsHeading: null,
    contactLabel: null,
    contactNote: null,
    attribution: null,
    mapCaption: null,
    contactUrl: null,
  };
}

/**
 * Homepage datasource: the anchor profile, the opening it gives, and the
 * atlas of the agents the organization has approved, drawn around it.
 */
export class OrganizationHomepageDataSource implements DataSource {
  public readonly id = "organization:homepage";
  public readonly name = "Organization Homepage DataSource";
  public readonly description =
    "Fetches the anchor profile and the agent atlas for the organization homepage";

  async fetch<T>(
    _query: unknown,
    outputSchema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const entityService = context.entityService;
    const profile = await fetchAnchorProfileData(
      entityService,
      organizationProfileSchema,
    );
    const atlas = await loadAgentAtlas(
      {
        entityService,
        semantic: {
          project: (request) => entityService.projectSemanticSpace(request),
        },
      },
      { name: profile.name, url: null },
    );
    return outputSchema.parse({
      profile,
      opening: openingFromProfile(profile),
      atlas,
    });
  }
}
