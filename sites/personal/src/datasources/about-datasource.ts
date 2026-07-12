import { fetchAnchorProfileData } from "@brains/plugins";
import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
} from "@brains/plugins";
import { personalProfileSchema, type PersonalProfile } from "../schemas";

interface AboutDataSourceOutput {
  profile: PersonalProfile;
}

/**
 * About page datasource — fetches full profile
 */
export class AboutDataSource implements DataSource {
  public readonly id = "personal:about";
  public readonly name = "About Page DataSource";
  public readonly description = "Fetches full profile data for the about page";

  async fetch<T>(
    _query: unknown,
    outputSchema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const profile = await fetchAnchorProfileData(
      context.entityService,
      personalProfileSchema,
    );

    const data: AboutDataSourceOutput = { profile };
    return outputSchema.parse(data);
  }
}
