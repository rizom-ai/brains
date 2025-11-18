import type { DataSource, BaseDataSourceContext } from "@brains/datasource";
import type { IEntityService } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import type { z } from "@brains/utils";
import { ProfileAdapter, type ProfileBody } from "@brains/profile-service";
import {
  type BlogPost,
  type BlogPostWithData,
  blogPostFrontmatterSchema,
} from "@brains/blog";
import type { DeckEntity } from "@brains/decks";

/**
 * Homepage data returned by datasource (non-enriched)
 * Site-builder will enrich posts and decks with url and typeLabel fields
 */
interface HomepageDataSourceOutput {
  profile: ProfileBody;
  posts: BlogPostWithData[];
  decks: DeckEntity[];
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

  constructor(private readonly entityService: IEntityService) {}

  /**
   * Fetch homepage data
   */
  async fetch<T>(
    _query: unknown,
    outputSchema: z.ZodSchema<T>,
    _context: BaseDataSourceContext,
  ): Promise<T> {
    // Fetch profile entity
    const profileEntities = await this.entityService.listEntities("profile", {
      limit: 1,
    });
    const profileEntity = profileEntities[0];
    if (!profileEntity) {
      throw new Error("Profile not found");
    }

    // Parse profile data using ProfileAdapter
    const profileAdapter = new ProfileAdapter();
    const profile: ProfileBody = profileAdapter.parseProfileBody(
      profileEntity.content,
    );

    // Fetch recent published posts (limit 20)
    const allPosts = await this.entityService.listEntities<BlogPost>("post", {
      limit: 100,
    });

    // Filter published posts and sort by date
    const publishedPosts = allPosts
      .filter((post: BlogPost) => post.metadata.status === "published")
      .sort((a: BlogPost, b: BlogPost) => {
        const dateA = new Date(a.metadata.publishedAt ?? a.created);
        const dateB = new Date(b.metadata.publishedAt ?? b.created);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, 20);

    // Parse frontmatter for posts to include excerpt and other display fields
    const posts: BlogPostWithData[] = publishedPosts.map((post) => {
      const { metadata: frontmatter, content: body } =
        parseMarkdownWithFrontmatter(post.content, blogPostFrontmatterSchema);
      return {
        ...post,
        frontmatter,
        body,
      };
    });

    // Fetch recent decks (limit 10)
    const allDecks = await this.entityService.listEntities<DeckEntity>("deck", {
      limit: 10,
    });

    // Sort decks by date
    const decks = allDecks.sort((a: DeckEntity, b: DeckEntity) => {
      const dateA = new Date(a.updated || a.created);
      const dateB = new Date(b.updated || b.created);
      return dateB.getTime() - dateA.getTime();
    });

    const data: HomepageDataSourceOutput = {
      profile,
      posts,
      decks,
    };

    return outputSchema.parse(data);
  }
}
