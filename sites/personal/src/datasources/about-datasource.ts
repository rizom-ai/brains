import { fetchAnchorProfileData } from "@brains/profile";
import {
  defineDataSource,
  type DataSourceDefinition,
} from "@brains/sdk/entities";
import { siteDataSourceRuntime } from "@brains/sdk/internal/site-runtime";
import { personalProfileSchema } from "../schemas";

/** About page datasource — fetches full profile */
export const aboutDataSource: DataSourceDefinition = defineDataSource({
  id: "about",
  name: "About Page DataSource",
  description: "Fetches full profile data for the about page",
  fetch: async (_query, _entities, context) => ({
    profile: await fetchAnchorProfileData(
      siteDataSourceRuntime(context).entityService,
      personalProfileSchema,
    ),
  }),
});
