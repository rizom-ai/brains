import type { JSX } from "react";
import { Head } from "@rizom/brain-ui/internal";
import {
  HomepageAtlas,
  HomepageFaqs,
  type HomepageFaq,
} from "@brains/site-atlas";
import type { OrganizationHomepageData } from "../schemas/homepage";
import { AgentRadarMap } from "./agent-radar";

/**
 * The organization's homepage: its opening over the radar of the people,
 * teams and organizations it works with, in the shared atlas frame, and its
 * published FAQs under it.
 */
export function OrganizationHomepage({
  profile,
  opening,
  map,
  askBox,
  faqs = [],
}: Omit<OrganizationHomepageData, "faqs"> & {
  faqs?: HomepageFaq[] | undefined;
}): JSX.Element {
  // The map is named by the team's caption when it wrote one.
  const caption =
    opening.mapCaption ?? "Closer to the centre, closer to our work";
  const description =
    [profile.intro, profile.description, profile.tagline].find(Boolean) ??
    profile.name;
  return (
    <>
      <Head title={profile.name} description={description} ogType="website" />
      <HomepageAtlas
        opening={opening}
        atlas={null}
        map={
          map
            ? {
                label:
                  opening.mapCaption ??
                  "The people, teams and organizations we work with",
                element: (
                  <AgentRadarMap
                    radar={map}
                    team={profile.name}
                    caption={caption}
                  />
                ),
              }
            : null
        }
        owner={profile.name}
        askBox={askBox}
      />
      <HomepageFaqs heading={opening.faqHeading ?? null} faqs={faqs} />
    </>
  );
}
