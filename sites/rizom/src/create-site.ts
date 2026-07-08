import type { DataSource, Plugin, ServicePluginContext } from "@brains/plugins";
import {
  extendSite,
  type RouteDefinitionInput,
  type SitePackage,
} from "@brains/site-composition";
import type { Template } from "@brains/templates";
import { rizomBaseSite } from "./runtime";
import {
  type RizomRuntimeConfigInput,
  RizomRuntimePlugin,
  type RizomThemeProfile,
} from "./runtime/plugin";

class RizomVariantPlugin extends RizomRuntimePlugin {
  private readonly contentNamespace: string;
  private readonly extraTemplates: Record<string, Template>;
  private readonly dataSources: DataSource[];
  constructor(
    packageName: string,
    config: RizomRuntimeConfigInput,
    contentNamespace: string,
    extraTemplates: Record<string, Template>,
    dataSources: DataSource[] = [],
  ) {
    super(packageName, config);
    this.contentNamespace = contentNamespace;
    this.extraTemplates = extraTemplates;
    this.dataSources = dataSources;
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
  /**
   * Selects the shared canvas background + accent profile. Omit for
   * sites that bring their own theme (e.g. the consolidated rizom.ai
   * site) — no canvas scripts or profile attribute get injected.
   */
  themeProfile?: RizomThemeProfile;
  layout: unknown;
  routes: RouteDefinitionInput[];
  templates: Record<string, Template>;
  dataSources?: DataSource[];
}

export function createRizomSite(
  options: CreateRizomSiteOptions,
): SitePackage<RizomRuntimeConfigInput, Plugin> {
  const plugin: SitePackage<RizomRuntimeConfigInput, Plugin>["plugin"] = (
    config?: RizomRuntimeConfigInput,
  ): Plugin =>
    new RizomVariantPlugin(
      options.packageName,
      {
        ...(options.themeProfile && { themeProfile: options.themeProfile }),
        ...(config ?? {}),
      },
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
