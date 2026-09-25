import type { HomepageOpeningData } from "./homepage-opening";
import type { HomepageAtlasData } from "../schemas/homepage-atlas";
import { fetchAnchorProfileData } from "@brains/profile";
import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
} from "@brains/plugins";
import {
  fetchRecentEntities,
  fetchSiteInfo,
  requireCta,
  type SiteInfoBody,
  type SiteInfoCTA,
} from "@brains/site-info";
import {
  professionalProfileSchema,
  type ProfessionalProfile,
} from "../schemas";
import {
  blogPostSchema,
  parsePostData,
  type BlogPost,
  type BlogPostWithData,
} from "@brains/blog";
import {
  deckSchema,
  parseDeckData,
  type DeckEntity,
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
  opening?: HomepageOpeningData | null;
  atlas?: HomepageAtlasData | null;
  askBox?: boolean;
  homepageOpening?: boolean;
}

/** The authored-homepage placement, only when the site opts in. */
export interface HomepagePlacementLoaders {
  loadOpening?:
    | ((context: BaseDataSourceContext) => Promise<HomepageOpeningData | null>)
    | undefined;
  loadAtlas?:
    | ((context: BaseDataSourceContext) => Promise<HomepageAtlasData | null>)
    | undefined;
  chatAvailable?:
    ((context: BaseDataSourceContext) => Promise<boolean>) | undefined;
}

/**
 * Homepage list datasource
 * Fetches profile, recent published posts, and recent decks for homepage display
 */
export class HomepageListDataSource implements DataSource {
  private readonly postsListUrl: string;
  private readonly decksListUrl: string;
  public readonly id = "professional:homepage-list";
  public readonly name = "Homepage List DataSource";
  public readonly description =
    "Fetches profile, blog posts, and presentation decks for homepage";

  private readonly placement: HomepagePlacementLoaders;

  constructor(
    postsListUrl: string,
    decksListUrl: string,
    placement: HomepagePlacementLoaders = {},
  ) {
    this.placement = placement;
    this.postsListUrl = postsListUrl;
    this.decksListUrl = decksListUrl;
  }

  /** The atlas is only worth projecting when the authored opening renders. */
  private async loadPlacement(
    context: BaseDataSourceContext,
  ): Promise<
    Pick<
      HomepageDataSourceOutput,
      "homepageOpening" | "opening" | "atlas" | "askBox"
    >
  > {
    const { loadOpening, loadAtlas, chatAvailable } = this.placement;
    if (!loadOpening) return {};
    const opening = await loadOpening(context);
    if (!opening) return { homepageOpening: true, opening, atlas: null };
    const atlas = loadAtlas ? await loadAtlas(context) : null;
    const askBox = (await chatAvailable?.(context)) ?? false;
    return { homepageOpening: true, opening, atlas, askBox };
  }

  /**
   * Fetch homepage data
   */
  async fetch<T>(
    _query: unknown,
    outputSchema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const entityService = context.entityService;

    // Fetch profile, posts, decks, and site-info in parallel
    const [profile, posts, decks, siteInfo] = await Promise.all([
      fetchAnchorProfileData(entityService, professionalProfileSchema),
      fetchRecentEntities<BlogPost, BlogPostWithData>(entityService, {
        entityType: "post",
        entitySchema: blogPostSchema,
        count: 3,
        parse: parsePostData,
      }),
      fetchRecentEntities<DeckEntity, DeckWithData>(entityService, {
        entityType: "deck",
        entitySchema: deckSchema,
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
      ...(await this.loadPlacement(context)),
    };

    return outputSchema.parse(data);
  }
}
