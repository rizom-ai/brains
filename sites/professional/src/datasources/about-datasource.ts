import type {
  DataSource,
  DataSourceSchema,
  BaseDataSourceContext,
} from "@brains/plugins";
import { fetchAnchorProfile } from "@brains/plugins";
import { AnchorProfileAdapter } from "@brains/identity-service";
import {
  professionalProfileSchema,
  type ProfessionalProfile,
} from "../schemas";

const adapter = new AnchorProfileAdapter();

/**
 * About page data returned by datasource
 */
interface AboutDataSourceOutput {
  profile: ProfessionalProfile;
}

/**
 * About page datasource
 * Fetches full profile data for about page display
 */
export class AboutDataSource implements DataSource {
  public readonly id = "professional:about";
  public readonly name = "About Page DataSource";
  public readonly description = "Fetches full profile data for the about page";

  /**
   * Fetch about page data
   */
  async fetch<T>(
    _query: unknown,
    outputSchema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const content = await fetchAnchorProfile(context.entityService);
    const profile = adapter.parseProfileBody(
      content,
      professionalProfileSchema,
    );

    const data: AboutDataSourceOutput = { profile };
    return outputSchema.parse(data);
  }
}
