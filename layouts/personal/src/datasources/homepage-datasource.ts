import type { DataSource, BaseDataSourceContext } from "@brains/plugins";
import { fetchAnchorProfile } from "@brains/plugins";
import { AnchorProfileAdapter } from "@brains/identity-service";
import { fetchSiteInfo } from "@brains/site-builder-plugin";
import { sortByPublicationDate, type z } from "@brains/utils";
import { personalProfileSchema, type PersonalProfile } from "../schemas";
import {
  type BlogPost,
  parsePostData,
  type BlogPostWithData,
} from "@brains/blog";
import type { SiteInfoCTA } from "@brains/site-builder-plugin";

const adapter = new AnchorProfileAdapter();

interface HomepageDataSourceOutput {
  profile: PersonalProfile;
  posts: BlogPostWithData[];
  postsListUrl: string;
  cta: SiteInfoCTA;
}

/**
 * Personal homepage datasource
 * Fetches profile and recent blog posts — no decks, no portfolio
 */
export class HomepageDataSource implements DataSource {
  public readonly id = "personal:homepage";
  public readonly name = "Personal Homepage DataSource";
  public readonly description =
    "Fetches profile and blog posts for a personal homepage";

  constructor(private readonly postsListUrl: string) {}

  async fetch<T>(
    _query: unknown,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const entityService = context.entityService;

    const [profileContent, publishedPosts, siteInfo] = await Promise.all([
      fetchAnchorProfile(entityService),
      entityService.listEntities<BlogPost>("post", {
        limit: 20,
      }),
      fetchSiteInfo(entityService),
    ]);

    const profile = adapter.parseProfileBody(
      profileContent,
      personalProfileSchema,
    );

    const posts = publishedPosts
      .sort(sortByPublicationDate)
      .slice(0, 6)
      .map(parsePostData);

    if (!siteInfo.cta) {
      throw new Error("CTA not configured in site-info");
    }

    const data: HomepageDataSourceOutput = {
      profile,
      posts,
      postsListUrl: this.postsListUrl,
      cta: siteInfo.cta,
    };

    return outputSchema.parse(data);
  }
}
