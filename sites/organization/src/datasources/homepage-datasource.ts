import type { HomepageOpeningContent } from "@brains/site-atlas";
import type { OrganizationHomepageData } from "../schemas/homepage";
import type { AgentRadar } from "../schemas/radar";
import type { OrganizationProfile } from "../schemas/organization-profile";

/** Profile fallback without a door when no public contact form is known. */
export function openingFromProfile(
  profile: OrganizationProfile,
): HomepageOpeningContent {
  return {
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

/** Pure composition, independent of runtime registries or author capabilities. */
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
