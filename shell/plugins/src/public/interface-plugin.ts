import { InterfacePlugin as RuntimeInterfacePlugin } from "../interface/interface-plugin";
import type { InterfacePluginContext as RuntimeInterfacePluginContext } from "../interface/context";
import type { PluginConfigSchema } from "../config";
import type { WebRouteDefinition } from "../types/web-routes";
import type {
  BaseJobTrackingInfo,
  InterfacePluginContext,
  Resource,
  Tool,
} from "./types";
import {
  HookedPublicPlugin,
  type CommonPluginHooks,
  type PluginPackageJson,
  type RuntimePluginDelegate,
} from "./public-plugin";

export interface InterfacePluginHooks<
  TContext,
> extends CommonPluginHooks<TContext> {
  getWebRoutes(): WebRouteDefinition[];
  requiresDaemonStartup(): boolean;
}

class InterfacePluginDelegate<
  TConfig,
  TConfigInput,
  TTrackingInfo extends BaseJobTrackingInfo,
> extends RuntimeInterfacePlugin<TConfig, TConfigInput, TTrackingInfo> {
  private readonly hooks: InterfacePluginHooks<InterfacePluginContext>;

  constructor(
    id: string,
    packageJson: PluginPackageJson,
    config: TConfigInput,
    configSchema: PluginConfigSchema<TConfig>,
    hooks: InterfacePluginHooks<InterfacePluginContext>,
  ) {
    super(id, packageJson, config, configSchema);
    this.hooks = hooks;
  }

  protected override onRegister(
    context: RuntimeInterfacePluginContext,
  ): Promise<void> {
    return this.hooks.onRegister(context);
  }

  protected override onReady(
    context: RuntimeInterfacePluginContext,
  ): Promise<void> {
    return this.hooks.onReady(context);
  }

  protected override onShutdown(): Promise<void> {
    return this.hooks.onShutdown();
  }

  protected override getTools(): Promise<Tool[]> {
    return this.hooks.getTools();
  }

  protected override getResources(): Promise<Resource[]> {
    return this.hooks.getResources();
  }

  protected override getInstructions(): Promise<string | undefined> {
    return this.hooks.getInstructions();
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return this.hooks.getWebRoutes();
  }

  override requiresDaemonStartup(): boolean {
    return this.hooks.requiresDaemonStartup();
  }
}

export abstract class InterfacePlugin<
  TConfig,
  TConfigInput,
  TTrackingInfo extends BaseJobTrackingInfo = BaseJobTrackingInfo,
> extends HookedPublicPlugin<TConfig, TConfigInput, InterfacePluginContext> {
  public readonly type = "interface" as const;

  /** @internal */
  protected override createDelegate(): RuntimePluginDelegate {
    return new InterfacePluginDelegate<TConfig, TConfigInput, TTrackingInfo>(
      this.id,
      this.packageJson,
      this.pluginConfig,
      this.configSchema,
      this.interfaceHooks(),
    );
  }

  /** @internal */
  protected interfaceHooks(): InterfacePluginHooks<InterfacePluginContext> {
    return {
      ...this.commonHooks(),
      getWebRoutes: (): WebRouteDefinition[] => this.getWebRoutes(),
      requiresDaemonStartup: (): boolean => this.requiresDaemonStartup(),
    };
  }

  getWebRoutes(): WebRouteDefinition[] {
    return [];
  }

  requiresDaemonStartup(): boolean {
    return false;
  }
}
