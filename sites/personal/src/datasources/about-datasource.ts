import type { DataSource, BaseDataSourceContext } from "@brains/plugins";
import { fetchAnchorProfileData } from "@brains/plugins";
import type { z } from "@brains/utils/zod";
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
    outputSchema: z.ZodSchema<T>,
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
