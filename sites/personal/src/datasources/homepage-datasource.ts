import { fetchAnchorProfileData } from "@brains/profile";
import {
  defineDataSource,
  type DataSourceDefinition,
} from "@brains/sdk/entities";
import { siteDataSourceRuntime } from "@brains/sdk/internal/site-runtime";
import {
  fetchRecentEntities,
  fetchSiteInfo,
  requireCta,
  type SiteInfoCTA,
} from "@brains/site-info";
import { personalProfileSchema, type PersonalProfile } from "../schemas";
import {
  blogPostSchema,
  parsePostData,
  type BlogPost,
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
export function homepageDataSource(postsListUrl: string): DataSourceDefinition {
  return defineDataSource({
    id: "homepage",
    name: "Personal Homepage DataSource",
    description: "Fetches profile and blog posts for a personal homepage",
    fetch: async (_query, _entities, context) => {
      const { entityService } = siteDataSourceRuntime(context);

      const [profile, posts, siteInfo] = await Promise.all([
        fetchAnchorProfileData(entityService, personalProfileSchema),
        fetchRecentEntities<BlogPost, BlogPostWithData>(entityService, {
          entityType: "post",
          entitySchema: blogPostSchema,
          count: 6,
          parse: parsePostData,
        }),
        fetchSiteInfo(entityService),
      ]);

      const data: HomepageDataSourceOutput = {
        profile,
        posts,
        postsListUrl,
        cta: requireCta(siteInfo.cta),
      };
      return data;
    },
  });
}
