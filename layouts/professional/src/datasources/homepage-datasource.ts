import type { DataSource, BaseDataSourceContext } from "@brains/plugins";
import {
  parseMarkdownWithFrontmatter,
  fetchAnchorProfile,
} from "@brains/plugins";
import { AnchorProfileAdapter } from "@brains/identity-service";
import { fetchSiteInfo } from "@brains/site-builder-plugin";
import { sortByPublicationDate, type z } from "@brains/utils";
import {
  professionalProfileSchema,
  type ProfessionalProfile,
} from "../schemas";
import {
  type BlogPost,
  type BlogPostWithData,
  blogPostFrontmatterSchema,
} from "@brains/blog";
import {
  deckFrontmatterSchema,
  type DeckEntity,
  type DeckWithData,
} from "@brains/decks";
import type { SiteInfoCTA } from "@brains/site-builder-plugin";

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

  private readonly adapter = new AnchorProfileAdapter();

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
        entityService.listEntities<BlogPost>("post", {
          limit: 20,
          filter: { metadata: { status: "published" } },
        }),
        entityService.listEntities<DeckEntity>("deck", {
          limit: 20,
          filter: { metadata: { status: "published" } },
        }),
        fetchSiteInfo(entityService),
      ]);

    const profile = this.adapter.parseProfileBody(
      profileContent,
      professionalProfileSchema,
    );

    // Sort by publishedAt (or created as fallback) and take the 3 most recent
    const posts: BlogPostWithData[] = publishedPosts
      .sort(sortByPublicationDate)
      .slice(0, 3)
      .map((post) => {
        const { metadata: frontmatter, content: body } =
          parseMarkdownWithFrontmatter(post.content, blogPostFrontmatterSchema);
        return { ...post, frontmatter, body };
      });

    const decks: DeckWithData[] = publishedDecks
      .sort(sortByPublicationDate)
      .slice(0, 3)
      .map((deck) => {
        const { metadata: frontmatter, content: body } =
          parseMarkdownWithFrontmatter(deck.content, deckFrontmatterSchema);
        return { ...deck, frontmatter, body };
      });

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
