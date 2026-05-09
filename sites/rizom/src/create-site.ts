import type { DataSource, Plugin, ServicePluginContext } from "@brains/plugins";
import {
  extendSite,
  type RouteDefinitionInput,
  type SitePackage,
} from "@brains/site-composition";
import type { Template } from "@brains/templates";
import rizomBaseSite from ".";
import { RizomRuntimePlugin, type RizomThemeProfile } from "./runtime/plugin";

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

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.templates.register(this.extraTemplates, this.contentNamespace);
    for (const dataSource of this.dataSources) {
      context.entities.registerDataSource(dataSource);
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
}

export function createRizomSite(
  options: CreateRizomSiteOptions,
): SitePackage<Record<string, unknown>, Plugin> {
  const plugin: SitePackage<Record<string, unknown>, Plugin>["plugin"] = (
    config?: Record<string, unknown>,
  ): Plugin =>
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
  });
}
