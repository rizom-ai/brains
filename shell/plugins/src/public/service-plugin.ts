import { ServicePlugin as RuntimeServicePlugin } from "../service/service-plugin";
import type { PluginConfigSchema } from "../config";
import type { ServicePluginContext } from "./types";
import {
  forwardCommonHooks,
  HookedPublicPlugin,
  type CommonPluginHooks,
  type PluginPackageJson,
  type RuntimePluginDelegate,
} from "./public-plugin";

type ServicePluginHooks = CommonPluginHooks<ServicePluginContext>;

class ServicePluginDelegate<TConfig, TConfigInput> extends forwardCommonHooks(
  RuntimeServicePlugin,
)<TConfig, TConfigInput> {
  protected readonly hooks: ServicePluginHooks;

  constructor(
    id: string,
    packageJson: PluginPackageJson,
    config: TConfigInput,
    configSchema: PluginConfigSchema<TConfig>,
    hooks: ServicePluginHooks,
  ) {
    super(id, packageJson, config, configSchema);
    this.hooks = hooks;
  }
}

export abstract class ServicePlugin<
  TConfig,
  TConfigInput,
> extends HookedPublicPlugin<TConfig, TConfigInput, ServicePluginContext> {
  public readonly type = "service" as const;

  /** @internal */
  protected override createDelegate(): RuntimePluginDelegate {
    return new ServicePluginDelegate(
      this.id,
      this.packageJson,
      this.pluginConfig,
      this.configSchema,
      this.commonHooks(),
    );
  }
}
