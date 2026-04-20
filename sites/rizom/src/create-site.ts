import type {
  Plugin,
  RouteDefinitionInput,
  ServicePluginContext,
} from "@brains/plugins";
import { extendSite, type SitePackage } from "@brains/site-composition";
import type { Template } from "@brains/templates";
import rizomBaseSite from ".";
import { RizomRuntimePlugin, type RizomThemeProfile } from "./runtime/plugin";

class RizomVariantPlugin extends RizomRuntimePlugin {
  constructor(
    packageName: string,
    config: Record<string, unknown>,
    private readonly contentNamespace: string,
    private readonly extraTemplates: Record<string, Template>,
  ) {
    super(packageName, config);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.templates.register(this.extraTemplates, this.contentNamespace);
  }
}

export interface CreateRizomSiteOptions {
  packageName: string;
  contentNamespace: string;
  themeProfile: RizomThemeProfile;
  layout: unknown;
  routes: RouteDefinitionInput[];
  templates: Record<string, Template>;
}

export function createRizomSite(options: CreateRizomSiteOptions): SitePackage {
  const plugin: SitePackage["plugin"] = (
    config?: Record<string, unknown>,
  ): Plugin =>
    new RizomVariantPlugin(
      options.packageName,
      { themeProfile: options.themeProfile, ...(config ?? {}) },
      options.contentNamespace,
      options.templates,
    );

  return extendSite(rizomBaseSite, {
    layouts: { default: options.layout },
    routes: options.routes,
    plugin,
  });
}
