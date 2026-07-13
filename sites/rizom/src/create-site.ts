import { extendSite } from "@brains/site-composition";
import type {
  EntityDisplayEntry,
  RouteDefinitionInput,
  SiteContentDefinition,
  SiteDefinition,
  SiteSectionGroup,
} from "@rizom/site";
import rizomBaseSite from ".";
import type {
  RizomPluginCapabilities,
  RizomSiteShell,
  RizomThemeProfile,
  SitePackage,
} from "./contracts";
import { buildRizomHeadScript, RizomRuntimePlugin } from "./runtime/plugin";

interface TemplateGroup {
  namespace: string;
  templates: Record<string, unknown>;
}

export interface RizomRuntimeHooks {
  contentNamespace: string;
  templates?: Record<string, unknown>;
  dataSources?: unknown[];
}

class RizomVariantPlugin extends RizomRuntimePlugin {
  private readonly templateGroups: TemplateGroup[];
  private readonly dataSources: unknown[];

  constructor(
    packageName: string,
    config: Record<string, unknown>,
    templateGroups: TemplateGroup[],
    dataSources: unknown[] = [],
  ) {
    super(packageName, config);
    this.templateGroups = templateGroups;
    this.dataSources = dataSources;
  }

  override async register(
    shell: RizomSiteShell,
    _context?: unknown,
  ): Promise<RizomPluginCapabilities> {
    for (const group of this.templateGroups) {
      shell.registerTemplates(group.templates, group.namespace);
    }
    for (const dataSource of this.dataSources) {
      shell.getDataSourceRegistry().register(dataSource);
    }
    return { tools: [], resources: [] };
  }
}

export interface CreateRizomSiteOptions {
  packageName: string;
  /**
   * Optional profile-driven chrome: sets `data-theme-profile` on the document
   * and loads the matching background canvas (product→tree, editorial→roots,
   * studio→constellation). Omit for sites that draw their own motifs — the
   * boot.js animation runtime always loads regardless. Only the retiring
   * rizom-work/rizom-foundation variants still use profiles; the machinery
   * goes with them at consolidation Phase 6.
   */
  themeProfile?: RizomThemeProfile;
  layout: unknown;
  routes: RouteDefinitionInput[];
  content?: SiteContentDefinition | SiteContentDefinition[];
  /**
   * Schema-first section groups (authored via `@rizom/site-sections`'
   * `defineSection`/`sectionGroup`). Registered as content templates at brain
   * boot exactly like `content`, so the CMS + directory-sync + resolver treat
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

function buildTemplateGroups(options: CreateRizomSiteOptions): TemplateGroup[] {
  if (!options.runtime?.templates) {
    return [];
  }
  return [
    {
      namespace: options.runtime.contentNamespace,
      templates: options.runtime.templates,
    },
  ];
}

function createRuntimePlugin(
  options: CreateRizomSiteOptions,
): SitePackage["plugin"] {
  if (!options.runtime?.templates && !options.runtime?.dataSources?.length) {
    return undefined;
  }

  return (config?: Record<string, unknown>): RizomRuntimePlugin =>
    new RizomVariantPlugin(
      options.packageName,
      {
        ...(options.themeProfile ? { themeProfile: options.themeProfile } : {}),
        ...(config ?? {}),
      },
      buildTemplateGroups(options),
      options.runtime?.dataSources,
    );
}

export function createRizomSite(
  options: CreateRizomSiteOptions,
): SiteDefinition {
  const plugin = createRuntimePlugin(options);

  return extendSite(rizomBaseSite, {
    layouts: { default: options.layout },
    routes: options.routes,
    ...(options.entityDisplay ? { entityDisplay: options.entityDisplay } : {}),
    ...(options.content ? { content: options.content } : {}),
    ...(options.sections ? { sections: options.sections } : {}),
    headScripts: [buildRizomHeadScript(options.themeProfile)],
    ...(plugin ? { plugin } : {}),
    ...(options.themeOverride ? { themeOverride: options.themeOverride } : {}),
  });
}
