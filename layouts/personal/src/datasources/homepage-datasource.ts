import type { DataSource, BaseDataSourceContext } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { sortByPublicationDate, type z } from "@brains/utils";
import { PersonalProfileParser, type PersonalProfile } from "../schemas";
import {
  type BlogPost,
  type BlogPostWithData,
  blogPostFrontmatterSchema,
} from "@brains/blog";
import { SiteInfoAdapter, type SiteInfoCTA } from "@brains/site-builder-plugin";

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

    // Fetch profile
    const profileEntities = await entityService.listEntities("anchor-profile", {
      limit: 1,
    });
    const profileEntity = profileEntities[0];
    if (!profileEntity) {
      throw new Error("Profile not found");
    }

    const profileParser = new PersonalProfileParser();
    const profile: PersonalProfile = profileParser.parse(profileEntity.content);

    // Fetch recent published posts
    const publishedPosts = await entityService.listEntities<BlogPost>("post", {
      limit: 20,
      filter: {
        metadata: {
          status: "published",
        },
      },
    });

    const sortedPosts = publishedPosts.sort(sortByPublicationDate).slice(0, 6);

    const posts: BlogPostWithData[] = sortedPosts.map((post) => {
      const { metadata: frontmatter, content: body } =
        parseMarkdownWithFrontmatter(post.content, blogPostFrontmatterSchema);
      return {
        ...post,
        frontmatter,
        body,
      };
    });

    // Fetch site-info for CTA
    const siteInfoEntities = await entityService.listEntities("site-info", {
      limit: 1,
    });
    const siteInfoEntity = siteInfoEntities[0];
    if (!siteInfoEntity) {
      throw new Error("Site info not found");
    }

    const siteInfoAdapter = new SiteInfoAdapter();
    const siteInfo = siteInfoAdapter.parseSiteInfoBody(siteInfoEntity.content);
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
