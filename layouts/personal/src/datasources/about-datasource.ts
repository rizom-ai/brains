import type { DataSource, BaseDataSourceContext } from "@brains/plugins";
import type { z } from "@brains/utils";
import { PersonalProfileParser, type PersonalProfile } from "../schemas";

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
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const entityService = context.entityService;

    const profileEntities = await entityService.listEntities("anchor-profile", {
      limit: 1,
    });
    const profileEntity = profileEntities[0];
    if (!profileEntity) {
      throw new Error("Profile not found");
    }

    const profileParser = new PersonalProfileParser();
    const profile: PersonalProfile = profileParser.parse(profileEntity.content);

    const data: AboutDataSourceOutput = { profile };
    return outputSchema.parse(data);
  }
}
