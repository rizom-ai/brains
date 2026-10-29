import { languagePath, type RouteDefinition } from "@brains/site-composition";
import type { RouteRegistry } from "@brains/site-engine";

/** The language a site without declared languages is built in. */
export const DEFAULT_SITE_LANGUAGE = "en";

/** A route as one build renders it: one page in one language. */
export interface BuildRoute extends RouteDefinition {
  language: string;
}

export interface BuildRoutes {
  routes: BuildRoute[];
  warnings: string[];
}

export interface CollectBuildRoutesOptions {
  /** The site's languages, the first its default. */
  languages?: string[] | undefined;
  /** Whether site-content is saved under an id (`zh-tw:home:cover`). */
  hasSavedCopy: (id: string) => Promise<boolean>;
}

/**
 * Every page the build renders. Each registered route is built in the
 * default language at its own path. In each other language it is built again
 * under the language's path, reading copy saved as `<tag>:<route>:<section>`,
 * once every section has copy in that language; the site package's default
 * copy is the default language's and is never used for another. A route
 * fed by a datasource, or with a section without a template, is built in the
 * default language only.
 */
export async function collectBuildRoutes(
  routeRegistry: RouteRegistry,
  options: CollectBuildRoutesOptions,
): Promise<BuildRoutes> {
  const registered = routeRegistry.list();
  const warnings =
    registered.length === 0 ? ["No routes registered for site build"] : [];
  const [defaultLanguage = DEFAULT_SITE_LANGUAGE, ...otherLanguages] =
    options.languages ?? [];

  const defaultRoutes = registered.map((route): BuildRoute => ({
    ...route,
    language: defaultLanguage,
  }));
  const translatable = registered.filter(isTranslatable);
  const translatedRoutes = await Promise.all(
    otherLanguages.flatMap((language) =>
      translatable.map((route) =>
        translateRoute(route, language, defaultLanguage, options.hasSavedCopy),
      ),
    ),
  );

  return {
    routes: [
      ...defaultRoutes,
      ...translatedRoutes.filter(
        (route): route is BuildRoute => route !== undefined,
      ),
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
): Promise<BuildRoute | undefined> {
  const tag = language.toLowerCase();
  const id = `${tag}:${route.id}`;
  const saved = await Promise.all(
    route.sections.map((section) => hasSavedCopy(`${id}:${section.id}`)),
  );
  if (!saved.every(Boolean)) return undefined;

  return {
    ...route,
    id,
    path: languagePath(language, defaultLanguage, route.path),
    language,
    sections: route.sections.map(
      ({ content: _default, ...section }) => section,
    ),
  };
}
