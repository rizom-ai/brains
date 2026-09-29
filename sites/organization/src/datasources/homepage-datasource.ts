import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
} from "@brains/plugins";
import { fetchAnchorProfileData } from "@brains/profile";
import {
  homepageOpeningSchema,
  type HomepageOpeningContent,
  type HomepageOpeningData,
} from "@brains/site-atlas";
import type { OrganizationHomepageData } from "../schemas/homepage";
import type { AgentRadar } from "../schemas/radar";
import {
  organizationProfileSchema,
  type OrganizationProfile,
} from "../schemas/organization-profile";
import { loadAgentRadar } from "./agent-radar";

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
    mapCaption: null,
    contactUrl: null,
  };
}

/**
 * The homepage's data: the authored opening when the team has written one,
 * else the one its anchor profile gives, beside the radar and, when Web Chat
 * serves it, the Ask box.
 */
export function organizationHomepageData({
  profile,
  authored,
  map,
  askBox,
}: {
  profile: OrganizationProfile;
  authored: HomepageOpeningContent | null;
  map: AgentRadar | null;
  askBox: boolean;
}): OrganizationHomepageData {
  return {
    profile,
    opening: authored ?? openingFromProfile(profile),
    map,
    askBox,
  };
}

/** The authored opening and the Ask box's availability, read with the plugin's runtime. */
export interface OrganizationHomepageLoaders {
  loadOpening?:
    | ((context: BaseDataSourceContext) => Promise<HomepageOpeningData | null>)
    | undefined;
  chatAvailable?:
    ((context: BaseDataSourceContext) => Promise<boolean>) | undefined;
}

/**
 * Homepage datasource: the anchor profile, the opening, the agent radar
 * drawn around the brain, and whether the Ask box can dock.
 */
export class OrganizationHomepageDataSource implements DataSource {
  public readonly id = "organization:homepage";
  public readonly name = "Organization Homepage DataSource";
  public readonly description =
    "Fetches the anchor profile, the authored opening and the agent radar for the organization homepage";

  private readonly loaders: OrganizationHomepageLoaders;

  constructor(loaders: OrganizationHomepageLoaders = {}) {
    this.loaders = loaders;
  }

  async fetch<T>(
    _query: unknown,
    outputSchema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const entityService = context.entityService;
    const [profile, map, authored, askBox] = await Promise.all([
      fetchAnchorProfileData(entityService, organizationProfileSchema),
      loadAgentRadar({
        entityService,
        semantic: {
          project: (request) => entityService.projectSemanticSpace(request),
        },
      }),
      this.loaders.loadOpening?.(context) ?? null,
      this.loaders.chatAvailable?.(context) ?? false,
    ]);
    return outputSchema.parse(
      organizationHomepageData({
        profile,
        authored: homepageOpeningSchema.parse(authored),
        map,
        askBox,
      }),
    );
  }
}
