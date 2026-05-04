import type { DataSource, BaseDataSourceContext } from "@brains/plugins";
import { fetchAnchorProfile } from "@brains/plugins";
import { AnchorProfileAdapter } from "@brains/identity-service";
import { fetchSiteInfo } from "@brains/site-info";
import { sortByPublicationDate, type z } from "@brains/utils";
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
import type { SiteInfoCTA } from "@brains/site-info";

const adapter = new AnchorProfileAdapter();

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
    const [profileContent, publishedPosts, publishedDecks, siteInfo] =
      await Promise.all([
        fetchAnchorProfile(entityService),
        entityService.listEntities<BlogPost>({
          entityType: "post",
          options: { limit: 20 },
        }),
        entityService.listEntities<DeckEntity>({
          entityType: "deck",
          options: { limit: 20 },
        }),
        fetchSiteInfo(entityService),
      ]);

    const profile = adapter.parseProfileBody(
      profileContent,
      professionalProfileSchema,
    );

    const posts = publishedPosts
      .sort(sortByPublicationDate)
      .slice(0, 3)
      .map(parsePostData);

    const decks = publishedDecks
      .sort(sortByPublicationDate)
      .slice(0, 3)
      .map(parseDeckData);

    if (!siteInfo.cta) {
      throw new Error("CTA not configured in site-info");
    }

    const data: HomepageDataSourceOutput = {
      profile,
      posts,
      decks,
      postsListUrl: this.postsListUrl,
      decksListUrl: this.decksListUrl,
      cta: siteInfo.cta,
    };

    return outputSchema.parse(data);
  }
}
