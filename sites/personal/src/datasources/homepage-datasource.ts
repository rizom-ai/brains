import type { DataSource, BaseDataSourceContext } from "@brains/plugins";
import { fetchAnchorProfileData } from "@brains/plugins";
import {
  fetchSiteInfo,
  fetchRecentEntities,
  requireCta,
  type SiteInfoCTA,
} from "@brains/site-info";
import { type z } from "@brains/utils/zod";
import { personalProfileSchema, type PersonalProfile } from "../schemas";
import {
  type BlogPost,
  parsePostData,
  type BlogPostWithData,
} from "@brains/blog";

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

    const [profile, posts, siteInfo] = await Promise.all([
      fetchAnchorProfileData(entityService, personalProfileSchema),
      fetchRecentEntities<BlogPost, BlogPostWithData>(entityService, {
        entityType: "post",
        count: 6,
        parse: parsePostData,
      }),
      fetchSiteInfo(entityService),
    ]);

    const data: HomepageDataSourceOutput = {
      profile,
      posts,
      postsListUrl: this.postsListUrl,
      cta: requireCta(siteInfo.cta),
    };

    return outputSchema.parse(data);
  }
}
