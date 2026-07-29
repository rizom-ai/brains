import { ServicePlugin as RuntimeServicePlugin } from "../service/service-plugin";
import type { ServicePluginContext as RuntimeServicePluginContext } from "../service/context";
import type { PluginConfigSchema } from "../config";
import type { Resource, ServicePluginContext, Tool } from "./types";
import {
  HookedPublicPlugin,
  type CommonPluginHooks,
  type PluginPackageJson,
  type RuntimePluginDelegate,
} from "./public-plugin";

type ServicePluginHooks = CommonPluginHooks<ServicePluginContext>;

class ServicePluginDelegate<TConfig, TConfigInput> extends RuntimeServicePlugin<
  TConfig,
  TConfigInput
> {
  private readonly hooks: ServicePluginHooks;

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

  protected override onRegister(
    context: RuntimeServicePluginContext,
  ): Promise<void> {
    return this.hooks.onRegister(context);
  }

  protected override onReady(
    context: RuntimeServicePluginContext,
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
