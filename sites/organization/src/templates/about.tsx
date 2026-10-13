import type { JSX } from "react";
import { AboutPage } from "@brains/site-atlas";
import type { OrganizationProfile } from "../schemas/organization-profile";

export interface OrganizationAboutData {
  profile: OrganizationProfile;
}

/**
 * The about page: the team or organization in its own words, then what it
 * is for, where it works, what it offers and how it works.
 */
export function OrganizationAbout({
  profile,
}: OrganizationAboutData): JSX.Element {
  return (
    <AboutPage
      title={`About ${profile.name}`}
      headDescription={
        [profile.description, profile.intro].find(Boolean) ?? profile.name
      }
      description={profile.description}
      story={profile.story}
      facts={[
        { heading: "Purpose", kind: "text", value: profile.purpose },
        { heading: "Mission", kind: "text", value: profile.mission },
        { heading: "Focus areas", kind: "tags", values: profile.focusAreas },
        { heading: "Capabilities", kind: "tags", values: profile.capabilities },
        { heading: "Offerings", kind: "tags", values: profile.offerings },
        {
          heading: "Working principles",
          kind: "list",
          values: profile.workingPrinciples,
        },
        { heading: "Values", kind: "tags", values: profile.values },
      ]}
      contact={{
        email: profile.email,
        website: profile.website,
        socialLinks: profile.socialLinks,
      }}
    />
  );
}
