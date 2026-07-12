import { fetchAnchorProfileData } from "@brains/plugins";
import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
} from "@brains/plugins";
import {
  fetchRecentEntities,
  fetchSiteInfo,
  requireCta,
  type SiteInfoCTA,
} from "@brains/site-info";
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
  private readonly postsListUrl: string;
  public readonly id = "personal:homepage";
  public readonly name = "Personal Homepage DataSource";
  public readonly description =
    "Fetches profile and blog posts for a personal homepage";

  constructor(postsListUrl: string) {
    this.postsListUrl = postsListUrl;
  }

  async fetch<T>(
    _query: unknown,
    outputSchema: DataSourceSchema<T>,
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
