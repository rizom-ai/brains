import type { DataSource, BaseDataSourceContext } from "@brains/plugins";
import { fetchAnchorProfile } from "@brains/plugins";
import { AnchorProfileAdapter } from "@brains/identity-service";
import type { z } from "@brains/utils";
import { personalProfileSchema, type PersonalProfile } from "../schemas";

const adapter = new AnchorProfileAdapter();

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
    const content = await fetchAnchorProfile(context.entityService);
    const profile = adapter.parseProfileBody(content, personalProfileSchema);

    const data: AboutDataSourceOutput = { profile };
    return outputSchema.parse(data);
  }
}
