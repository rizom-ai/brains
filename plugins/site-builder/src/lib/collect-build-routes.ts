import {
  languagePath,
  type NavigationItem,
  type RouteDefinition,
  type SiteAlternate,
  type SiteLayoutInfo,
  type SiteMetadataTranslation,
} from "@brains/site-composition";
import type { RouteRegistry } from "@brains/site-engine";

/** The language a site without declared languages is built in. */
export const DEFAULT_SITE_LANGUAGE = "en";

export type SiteNavigation = SiteLayoutInfo["navigation"];

/** A route as one build renders it: one page in one language. */
export interface BuildRoute extends RouteDefinition {
  language: string;
  /** Every language this page is built in, with its path there. */
  alternates: SiteAlternate[];
  /** A translated page's navigation: the pages built in its language. */
  siteNavigation?: SiteNavigation | undefined;
  /** A translated page's site title, description, copyright and CTA. */
  siteTranslation?: SiteMetadataTranslation | undefined;
}

export interface BuildRoutes {
  routes: BuildRoute[];
  warnings: string[];
}

export interface CollectBuildRoutesOptions {
  /** The site's languages, the first its default. */
  languages?: string[] | undefined;
  /**
   * The site-info's chrome per language. A language without one is not
   * built: its pages would carry the default language's title and footer.
   */
  siteTranslations?: Record<string, SiteMetadataTranslation> | undefined;
  /** Whether site-content is saved under an id (`zh-tw:home:cover`). */
  hasSavedCopy: (id: string) => Promise<boolean>;
}

type TranslatedRoute = Omit<
  BuildRoute,
  "alternates" | "siteNavigation" | "siteTranslation"
>;

/** A language's entry in a record keyed by language tag, whatever its case. */
function translationFor<T>(
  translations: Record<string, T> | undefined,
  language: string,
): T | undefined {
  const tag = language.toLowerCase();
  return Object.entries(translations ?? {}).find(
    ([key]) => key.toLowerCase() === tag,
  )?.[1];
}

/** The routes one language is built in, by the id of the route translated. */
interface LanguageBuild {
  language: string;
  byRouteId: Map<string, TranslatedRoute>;
}

/**
 * Every page the build renders. Each registered route is built in the
 * default language at its own path. In each other language it is built again
 * under the language's path, reading copy saved as `<tag>:<route>:<section>`,
 * once every section has copy in that language; the site package's default
 * copy is the default language's and is never used for another. A route
 * fed by a datasource, or with a section without a template, is built in the
 * default language only. Every version of a page lists the languages it is
 * built in, and a translated page carries its language's navigation.
 */
export async function collectBuildRoutes(
  routeRegistry: Pick<RouteRegistry, "list" | "getNavigationItems">,
  options: CollectBuildRoutesOptions,
): Promise<BuildRoutes> {
  const registered = routeRegistry.list();
  const warnings =
    registered.length === 0 ? ["No routes registered for site build"] : [];
  const [defaultLanguage = DEFAULT_SITE_LANGUAGE, ...declared] =
    options.languages ?? [];
  const otherLanguages = declared.filter(
    (language) =>
      translationFor(options.siteTranslations, language) !== undefined,
  );

  const translatable = registered.filter(isTranslatable);
  const builds = await Promise.all(
    otherLanguages.map(async (language): Promise<LanguageBuild> => ({
      language,
      byRouteId: new Map(
        (
          await Promise.all(
            translatable.map(async (route) => {
              const translated = await translateRoute(
                route,
                language,
                defaultLanguage,
                options.hasSavedCopy,
              );
              return translated ? ([route.id, translated] as const) : null;
            }),
          )
        ).filter((entry) => entry !== null),
      ),
    })),
  );

  const alternatesOf = (route: RouteDefinition): SiteAlternate[] => [
    { language: defaultLanguage, path: route.path },
    ...builds.flatMap(({ language, byRouteId }) => {
      const translated = byRouteId.get(route.id);
      return translated ? [{ language, path: translated.path }] : [];
    }),
  ];

  const navigationOf = ({
    language,
    byRouteId,
  }: LanguageBuild): SiteNavigation => {
    const versionByDefaultPath = new Map(
      registered.flatMap((route) => {
        const translated = byRouteId.get(route.id);
        const translation = translationFor(route.translations, language);
        return translated
          ? [
              [
                route.path,
                {
                  href: translated.path,
                  label: translation?.navigationLabel ?? translation?.title,
                },
              ] as const,
            ]
          : [];
      }),
    );
    // A page without a translated label keeps its own rather than vanish.
    const localize = (items: NavigationItem[]): NavigationItem[] =>
      items.flatMap((item) => {
        const version = versionByDefaultPath.get(item.href);
        return version
          ? [
              {
                ...item,
                href: version.href,
                label: version.label ?? item.label,
              },
            ]
          : [];
      });
    return {
      primary: localize(routeRegistry.getNavigationItems("primary")),
      secondary: localize(routeRegistry.getNavigationItems("secondary")),
    };
  };

  return {
    routes: [
      ...registered.map((route): BuildRoute => ({
        ...route,
        language: defaultLanguage,
        alternates: alternatesOf(route),
      })),
      ...builds.flatMap((build) => {
        const siteNavigation = navigationOf(build);
        const siteTranslation = translationFor(
          options.siteTranslations,
          build.language,
        );
        return registered.flatMap((route): BuildRoute[] => {
          const translated = build.byRouteId.get(route.id);
          return translated
            ? [
                {
                  ...translated,
                  alternates: alternatesOf(route),
                  siteNavigation,
                  siteTranslation,
                },
              ]
            : [];
        });
      }),
    ],
    warnings,
  };
}

function isTranslatable(route: RouteDefinition): boolean {
  return (
    route.sections.length > 0 &&
    route.sections.every(
      (section) => section.template !== "" && section.dataQuery === undefined,
    )
  );
}

async function translateRoute(
  route: RouteDefinition,
  language: string,
  defaultLanguage: string,
  hasSavedCopy: (id: string) => Promise<boolean>,
): Promise<TranslatedRoute | undefined> {
  const id = `${language.toLowerCase()}:${route.id}`;
  const saved = await Promise.all(
    route.sections.map((section) => hasSavedCopy(`${id}:${section.id}`)),
  );
  if (!saved.every(Boolean)) return undefined;
  const translation = translationFor(route.translations, language);

  // Without its own title the page takes the site's, in its language.
  return {
    ...route,
    id,
    title: translation?.title ?? "",
    description: translation?.description ?? "",
    path: languagePath(language, defaultLanguage, route.path),
    language,
    sections: route.sections.map(
      ({ content: _default, ...section }) => section,
    ),
  };
}
