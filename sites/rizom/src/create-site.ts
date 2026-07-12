import { extendSite } from "@brains/site-composition";
import type {
  RouteDefinitionInput,
  SiteContentDefinition,
  SiteDefinition,
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
  themeProfile: RizomThemeProfile;
  layout: unknown;
  routes: RouteDefinitionInput[];
  content?: SiteContentDefinition | SiteContentDefinition[];
  themeOverride?: string;
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
      { themeProfile: options.themeProfile, ...(config ?? {}) },
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
    ...(options.content ? { content: options.content } : {}),
    headScripts: [buildRizomHeadScript(options.themeProfile)],
    ...(plugin ? { plugin } : {}),
    ...(options.themeOverride ? { themeOverride: options.themeOverride } : {}),
  });
}
