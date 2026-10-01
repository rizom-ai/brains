import type {
  HomepageAtlasData,
  HomepageFaq,
  HomepageOpeningData,
} from "@brains/site-atlas";
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
  faqs?: HomepageFaq[];
}

/**
 * The professional homepage opens on the atlas only with a door to the
 * contact form; without one it keeps its list homepage.
 */
export function requireDoor(
  opening: HomepageOpeningData | null,
): HomepageOpeningData | null {
  return opening?.contactUrl ? opening : null;
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
  /** The owner's published FAQs, most asked first, shown under the atlas. */
  loadFaqs?:
    ((context: BaseDataSourceContext) => Promise<HomepageFaq[]>) | undefined;
}

type HomepagePlacement = Pick<
  HomepageDataSourceOutput,
  "homepageOpening" | "opening" | "atlas" | "askBox" | "faqs"
>;

/**
 * The authored homepage: the atlas, the box and the FAQs are only worth
 * loading when the authored opening renders.
 */
export async function loadHomepagePlacement(
  placement: HomepagePlacementLoaders,
  context: BaseDataSourceContext,
): Promise<HomepagePlacement> {
  const { loadOpening, loadAtlas, chatAvailable, loadFaqs } = placement;
  if (!loadOpening) return {};
  const opening = requireDoor(await loadOpening(context));
  if (!opening) return { homepageOpening: true, opening, atlas: null };
  const [atlas, askBox, faqs] = await Promise.all([
    loadAtlas ? loadAtlas(context) : null,
    chatAvailable?.(context) ?? false,
    loadFaqs?.(context) ?? [],
  ]);
  return { homepageOpening: true, opening, atlas, askBox, faqs };
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
      ...(await loadHomepagePlacement(this.placement, context)),
    };

    return outputSchema.parse(data);
  }
}
