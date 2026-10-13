import type { JSX } from "react";
import { AboutPage } from "@brains/site-atlas";
import type { ProfessionalProfile } from "../schemas";

/**
 * About page data structure
 */
export interface AboutPageData {
  profile: ProfessionalProfile;
}

/**
 * About page layout
 * Two-zone design: full-width story prose, then structured metadata grid
 */
export const AboutPageLayout = ({ profile }: AboutPageData): JSX.Element => (
  <AboutPage
    title={`About ${profile.name || "Me"}`}
    // First non-empty wins — empty strings fall through like absent values.
    headDescription={
      [profile.description, profile.intro].find((value) => value) ??
      "About page"
    }
    description={profile.description}
    story={profile.story}
    facts={[
      { heading: "Expertise", kind: "tags", values: profile.expertise },
      { heading: "Current Focus", kind: "text", value: profile.currentFocus },
      { heading: "Availability", kind: "text", value: profile.availability },
    ]}
    contact={{
      email: profile.email,
      website: profile.website,
      socialLinks: profile.socialLinks,
    }}
  />
);
