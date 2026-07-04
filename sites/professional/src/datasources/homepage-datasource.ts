import type { DataSource, BaseDataSourceContext } from "@brains/plugins";
import { fetchAnchorProfileData } from "@brains/plugins";
import {
  fetchSiteInfo,
  fetchRecentEntities,
  requireCta,
  type SiteInfoCTA,
  type SiteInfoBody,
} from "@brains/site-info";
import { type z } from "@brains/utils/zod";
import {
  professionalProfileSchema,
  type ProfessionalProfile,
} from "../schemas";
import {
  type BlogPost,
  parsePostData,
  type BlogPostWithData,
} from "@brains/blog";
import {
  type DeckEntity,
  parseDeckData,
  type DeckWithData,
} from "@brains/decks";

type HomepageSections = NonNullable<SiteInfoBody["sections"]>;

/**
 * Homepage data returned by datasource (non-enriched)
 * Site-builder will enrich posts and decks with url and typeLabel fields
 */
interface HomepageDataSourceOutput {
  profile: ProfessionalProfile;
  posts: BlogPostWithData[];
  decks: DeckWithData[];
  postsListUrl: string;
  decksListUrl: string;
  cta: SiteInfoCTA;
  sections: HomepageSections;
}

/**
 * Homepage list datasource
 * Fetches profile, recent published posts, and recent decks for homepage display
 */
export class HomepageListDataSource implements DataSource {
  public readonly id = "professional:homepage-list";
  public readonly name = "Homepage List DataSource";
  public readonly description =
    "Fetches profile, blog posts, and presentation decks for homepage";

  constructor(
    private readonly postsListUrl: string,
    private readonly decksListUrl: string,
  ) {}

  /**
   * Fetch homepage data
   */
  async fetch<T>(
    _query: unknown,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const entityService = context.entityService;

    // Fetch profile, posts, decks, and site-info in parallel
    const [profile, posts, decks, siteInfo] = await Promise.all([
      fetchAnchorProfileData(entityService, professionalProfileSchema),
      fetchRecentEntities<BlogPost, BlogPostWithData>(entityService, {
        entityType: "post",
        count: 3,
        parse: parsePostData,
      }),
      fetchRecentEntities<DeckEntity, DeckWithData>(entityService, {
        entityType: "deck",
        count: 3,
        parse: parseDeckData,
      }),
      fetchSiteInfo(entityService),
    ]);

    const data: HomepageDataSourceOutput = {
      profile,
      posts,
      decks,
      postsListUrl: this.postsListUrl,
      decksListUrl: this.decksListUrl,
      cta: requireCta(siteInfo.cta),
      sections: siteInfo.sections ?? {},
    };

    return outputSchema.parse(data);
  }
}
