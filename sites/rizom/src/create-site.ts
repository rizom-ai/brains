import { extendSite } from "@brains/site-composition";
import rizomBaseSite from ".";
import type {
  DataSource,
  RizomSiteShell,
  RizomThemeProfile,
  RouteDefinitionInput,
  SitePackage,
  Template,
} from "./contracts";
import { RizomRuntimePlugin } from "./runtime/plugin";

class RizomVariantPlugin extends RizomRuntimePlugin {
  constructor(
    packageName: string,
    config: Record<string, unknown>,
    private readonly contentNamespace: string,
    private readonly extraTemplates: Record<string, Template>,
    private readonly dataSources: DataSource[] = [],
  ) {
    super(packageName, config);
  }

  protected override async onRegister(shell: RizomSiteShell): Promise<void> {
    await super.onRegister(shell);
    shell.registerTemplates(this.extraTemplates, this.contentNamespace);
    for (const dataSource of this.dataSources) {
      shell.getDataSourceRegistry().register(dataSource);
    }
  }
}

export interface CreateRizomSiteOptions {
  packageName: string;
  contentNamespace: string;
  themeProfile: RizomThemeProfile;
  layout: unknown;
  routes: RouteDefinitionInput[];
  templates: Record<string, Template>;
  dataSources?: DataSource[];
  themeOverride?: string;
}

export function createRizomSite(
  options: CreateRizomSiteOptions,
): SitePackage<Record<string, unknown>, RizomRuntimePlugin> {
  const plugin: SitePackage<
    Record<string, unknown>,
    RizomRuntimePlugin
  >["plugin"] = (config?: Record<string, unknown>): RizomRuntimePlugin =>
    new RizomVariantPlugin(
      options.packageName,
      { themeProfile: options.themeProfile, ...(config ?? {}) },
      options.contentNamespace,
      options.templates,
      options.dataSources,
    );

  return extendSite(rizomBaseSite, {
    layouts: { default: options.layout },
    routes: options.routes,
    plugin,
    ...(options.themeOverride ? { themeOverride: options.themeOverride } : {}),
  });
}
