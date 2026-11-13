import { extendSite } from "@brains/site-composition";
import {
  withSiteRuntime,
  type DataSourceDefinition,
  type SiteRuntimeDeclaration,
} from "@brains/sdk/internal/site-runtime";
import type { Template } from "@brains/templates";
import { z } from "@brains/utils/zod";
import type {
  EntityDisplayEntry,
  RouteDefinitionInput,
  SiteContent,
  SiteSectionGroup,
} from "@rizom/site";
import { rizomBaseSite } from "./runtime";
import type { SitePackage } from "./contracts";
import { buildRizomHeadScript } from "./runtime/plugin";

export interface RizomRuntimeHooks {
  contentNamespace: string;
  templates?: Record<string, Template>;
  /** The site's data sources, registered as `<contentNamespace>:<id>`. */
  dataSources?: readonly DataSourceDefinition[];
}

/** What a Rizom site is configured with: a theme it names, when it names one. */
const rizomSiteConfigSchema = z.object({
  theme: z
    .string({
      error: (issue) =>
        `Invalid rizom site theme ${JSON.stringify(issue.input)}; expected a package name string`,
    })
    .optional(),
});

export interface CreateRizomSiteOptions {
  packageName: string;
  layout: unknown;
  routes: RouteDefinitionInput[];
  content?: SiteContent;
  /**
   * Schema-first section groups (authored via `@rizom/site`'
   * `defineSection`/`sectionGroup`). Registered as content templates at brain
   * boot exactly like `content`, so the Studio + directory-sync + resolver treat
   * them identically — but the section shape is derived from one zod schema.
   */
  sections?: SiteSectionGroup | SiteSectionGroup[];
  themeOverride?: string;
  /**
   * Presentation config for entity-backed list/detail routes (labels, plural
   * names, navigation). Merged onto the base site's empty map. Sites that
   * surface plugin lists — e.g. `post`→"Essay", `deck`→"Talk" — set it here.
   */
  entityDisplay?: Record<string, EntityDisplayEntry>;
  /** Advanced runtime hooks for in-repo sites that need custom template/data-source wiring. */
  runtime?: RizomRuntimeHooks;
}

function siteRuntime(
  runtime: RizomRuntimeHooks,
): SiteRuntimeDeclaration<typeof rizomSiteConfigSchema> {
  return {
    id: runtime.contentNamespace,
    config: rizomSiteConfigSchema,
    templates: runtime.templates ?? {},
    dataSources: () => runtime.dataSources ?? [],
  };
}

export function createRizomSite(options: CreateRizomSiteOptions): SitePackage {
  const site = extendSite(rizomBaseSite, {
    layouts: { default: options.layout },
    routes: options.routes,
    ...(options.entityDisplay ? { entityDisplay: options.entityDisplay } : {}),
    ...(options.content ? { content: options.content } : {}),
    ...(options.sections ? { sections: options.sections } : {}),
    headScripts: [buildRizomHeadScript()],
    ...(options.themeOverride ? { themeOverride: options.themeOverride } : {}),
  });
  const { runtime } = options;
  return runtime?.templates || runtime?.dataSources?.length
    ? withSiteRuntime(site, siteRuntime(runtime))
    : site;
}
