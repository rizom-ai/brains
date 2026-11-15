import type {
  HomepageAtlasData,
  HomepageFaq,
  HomepageOpeningData,
} from "@brains/site-atlas";
import { fetchAnchorProfileData } from "@brains/profile";
import {
  defineDataSource,
  type DataSourceDefinition,
} from "@brains/sdk/entities";
import {
  siteDataSourceRuntime,
  type SiteDataSourceRuntime,
} from "@brains/sdk/internal/site-runtime";
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

/** The build a homepage's loaders read: its entity reads, and whether it is production. */
/** What a declared data source is told about the read it serves. */
type HomepageRead = Parameters<DataSourceDefinition["fetch"]>[2];

export interface HomepageBuild {
  readonly entityService: SiteDataSourceRuntime["entityService"];
  readonly publishedOnly?: boolean;
}

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
    | ((context: HomepageBuild) => Promise<HomepageOpeningData | null>)
    | undefined;
  loadAtlas?:
    ((context: HomepageBuild) => Promise<HomepageAtlasData | null>) | undefined;
  chatAvailable?: ((context: HomepageBuild) => Promise<boolean>) | undefined;
  /** The owner's published FAQs, most asked first, shown under the atlas. */
  loadFaqs?: ((context: HomepageBuild) => Promise<HomepageFaq[]>) | undefined;
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
  context: HomepageBuild,
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
export function homepageListDataSource(
  postsListUrl: string,
  decksListUrl: string,
  placement: (
    runtime: SiteDataSourceRuntime,
    read: HomepageRead,
  ) => HomepagePlacementLoaders = () => ({}),
): DataSourceDefinition {
  return defineDataSource({
    id: "homepage-list",
    name: "Homepage List DataSource",
    description:
      "Fetches profile, blog posts, and presentation decks for homepage",
    fetch: async (_query, _entities, context) => {
      const runtime = siteDataSourceRuntime(context);
      const entityService = runtime.entityService;
      // The build's reads, as the class's loaders were handed them.
      const build: HomepageBuild = {
        entityService,
        ...(context.publishedOnly !== undefined
          ? { publishedOnly: context.publishedOnly }
          : {}),
      };

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
        postsListUrl,
        decksListUrl,
        cta: requireCta(siteInfo.cta),
        sections: siteInfo.sections ?? {},
        ...(await loadHomepagePlacement(placement(runtime, context), build)),
      };
      return data;
    },
  });
}
