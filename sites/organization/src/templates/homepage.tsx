import type { JSX } from "react";
import { Head } from "@brains/ui-library";
import { HomepageAtlas } from "@brains/site-atlas";
import type { OrganizationHomepageData } from "../schemas/homepage";

/**
 * The organization's homepage: its opening over the atlas of the agents it
 * works with, drawn around it on the shared topographic terrain.
 */
export function OrganizationHomepage({
  profile,
  opening,
  atlas,
}: OrganizationHomepageData): JSX.Element {
  const description =
    [profile.intro, profile.description, profile.tagline].find(Boolean) ??
    profile.name;
  return (
    <>
      <Head title={profile.name} description={description} ogType="website" />
      <HomepageAtlas
        opening={opening}
        atlas={atlas}
        owner={profile.name}
        mapLabel="Map of the agent network"
      />
    </>
  );
}
