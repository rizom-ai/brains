import { askBoxAvailabilityState } from "@brains/contracts";
import { loadPublicFaqs } from "@brains/faq";
import { fetchAnchorProfileData } from "@brains/profile";
import {
  defineDataSource,
  type DataSourceDefinition,
} from "@brains/sdk/entities";
import { siteDataSourceRuntime } from "@brains/sdk/internal/site-runtime";
import {
  homepageChatAvailable,
  homepageOpeningSchema,
  loadHomepageOpening,
  type HomepageFaq,
  type HomepageOpeningContent,
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
    faqHeading: null,
    contactUrl: null,
  };
}

/**
 * The homepage's data: the authored opening when the team has written one,
 * else the one its anchor profile gives, beside the radar and, when Web Chat
 * serves it, the Ask box; under them, its published FAQs.
 */
export function organizationHomepageData({
  profile,
  authored,
  map,
  askBox,
  faqs = [],
}: {
  profile: OrganizationProfile;
  authored: HomepageOpeningContent | null;
  map: AgentRadar | null;
  askBox: boolean;
  faqs?: HomepageFaq[];
}): OrganizationHomepageData {
  return {
    profile,
    opening: authored ?? openingFromProfile(profile),
    map,
    askBox,
    faqs,
  };
}

/** How many published FAQs the homepage shows, as on the professional homepage. */
const HOMEPAGE_FAQ_LIMIT = 6;

/**
 * Homepage datasource: the anchor profile, the opening, the agent radar
 * drawn around the brain, whether the Ask box can dock, and the published
 * FAQs.
 */
export const homepageDataSource: DataSourceDefinition = defineDataSource({
  id: "homepage",
  name: "Organization Homepage DataSource",
  description:
    "Fetches the anchor profile, the authored opening and the agent radar for the organization homepage",
  fetch: async (_query, _entities, context) => {
    const runtime = siteDataSourceRuntime(context);
    const entityService = runtime.entityService;
    // The build's reads, as the class's loaders were handed them.
    const build = {
      entityService,
      ...(context.publishedOnly !== undefined
        ? { publishedOnly: context.publishedOnly }
        : {}),
    };
    const [profile, map, authored, askBox, faqs] = await Promise.all([
      fetchAnchorProfileData(entityService, organizationProfileSchema),
      loadAgentRadar({
        entityService,
        semantic: {
          project: (request) => entityService.projectSemanticSpace(request),
        },
      }),
      loadHomepageOpening(build, {
        webRoutes: { getRoutes: () => runtime.webRoutes() },
        siteUrl: runtime.siteUrl,
        previewUrl: runtime.previewUrl,
        localSiteUrl: runtime.localSiteUrl,
        preferLocalUrls: runtime.preferLocalUrls,
      }),
      homepageChatAvailable(
        context,
        context.sharedState(askBoxAvailabilityState),
      ),
      loadPublicFaqs(build, HOMEPAGE_FAQ_LIMIT, runtime.logger),
    ]);
    return organizationHomepageData({
      profile,
      authored: homepageOpeningSchema.parse(authored),
      map,
      askBox,
      faqs,
    });
  },
});
