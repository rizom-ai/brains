import { InterfacePlugin as RuntimeInterfacePlugin } from "../interface/interface-plugin";
import type { PluginConfigSchema } from "../config";
import type { WebRouteDefinition } from "../types/web-routes";
import type { BaseJobTrackingInfo, InterfacePluginContext } from "./types";
import {
  forwardInterfaceHooks,
  HookedPublicPlugin,
  type InterfacePluginHooks,
  type PluginPackageJson,
  type RuntimePluginDelegate,
} from "./public-plugin";

class InterfacePluginDelegate<
  TConfig,
  TConfigInput,
  TTrackingInfo extends BaseJobTrackingInfo,
> extends forwardInterfaceHooks(RuntimeInterfacePlugin)<
  TConfig,
  TConfigInput,
  TTrackingInfo
> {
  protected readonly hooks: InterfacePluginHooks<InterfacePluginContext>;

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
