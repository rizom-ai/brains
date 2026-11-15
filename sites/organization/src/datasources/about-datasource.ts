import { fetchAnchorProfileData } from "@brains/profile";
import {
  defineDataSource,
  type DataSourceDefinition,
} from "@brains/sdk/entities";
import { siteDataSourceRuntime } from "@brains/sdk/internal/site-runtime";
import { organizationProfileSchema } from "../schemas/organization-profile";

/** About page datasource: the team's or organization's anchor profile. */
export const aboutDataSource: DataSourceDefinition = defineDataSource({
  id: "about",
  name: "Organization About DataSource",
  description: "Fetches the anchor profile for the organization about page",
  fetch: async (_query, _entities, context) => ({
    profile: await fetchAnchorProfileData(
      siteDataSourceRuntime(context).entityService,
      organizationProfileSchema,
    ),
  }),
});
