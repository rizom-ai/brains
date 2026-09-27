import type { JSX } from "react";
import { Head } from "@brains/ui-library";
import { HomepageAtlas } from "@brains/site-atlas";
import type { OrganizationHomepageData } from "../schemas/homepage";
import { AgentRadarMap } from "./agent-radar";

/**
 * The organization's homepage: its opening over the radar of the people,
 * teams and organizations it works with, in the shared atlas frame.
 */
export function OrganizationHomepage({
  profile,
  opening,
  map,
}: OrganizationHomepageData): JSX.Element {
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
                label: "The people, teams and organizations we work with",
                element: <AgentRadarMap radar={map} team={profile.name} />,
              }
            : null
        }
        owner={profile.name}
      />
    </>
  );
}
