import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
} from "@brains/plugins";
import { fetchAnchorProfileData } from "@brains/profile";
import { organizationProfileSchema } from "../schemas/organization-profile";

/** About page datasource: the team's or organization's anchor profile. */
export class OrganizationAboutDataSource implements DataSource {
  public readonly id = "organization:about";
  public readonly name = "Organization About DataSource";
  public readonly description =
    "Fetches the anchor profile for the organization about page";

  async fetch<T>(
    _query: unknown,
    outputSchema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const profile = await fetchAnchorProfileData(
      context.entityService,
      organizationProfileSchema,
    );
    return outputSchema.parse({ profile });
  }
}
