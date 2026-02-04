import type { DataSource, BaseDataSourceContext } from "@brains/plugins";
import type { z } from "@brains/utils";
import {
  ProfessionalProfileParser,
  type ProfessionalProfile,
} from "../schemas";

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
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const entityService = context.entityService;

    // Fetch profile entity
    const profileEntities = await entityService.listEntities("profile", {
      limit: 1,
    });
    const profileEntity = profileEntities[0];
    if (!profileEntity) {
      throw new Error("Profile not found");
    }

    // Parse profile data using ProfessionalProfileParser
    const profileParser = new ProfessionalProfileParser();
    const profile: ProfessionalProfile = profileParser.parse(
      profileEntity.content,
    );

    const data: AboutDataSourceOutput = {
      profile,
    };

    return outputSchema.parse(data);
  }
}
