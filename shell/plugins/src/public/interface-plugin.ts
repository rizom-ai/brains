import { InterfacePlugin as RuntimeInterfacePlugin } from "../interface/interface-plugin";
import type { InterfacePluginContext as RuntimeInterfacePluginContext } from "../interface/context";
import type {
  IShell,
  PluginCapabilities,
  PluginRegistrationContext,
} from "../interfaces";
import type { WebRouteDefinition } from "../types/web-routes";
import type { z } from "@brains/utils";
import type {
  BaseJobTrackingInfo,
  InterfacePluginContext,
  Plugin,
  Resource,
  Tool,
} from "./types";

interface InterfacePluginHooks {
  onRegister(context: InterfacePluginContext): Promise<void>;
  onReady(context: InterfacePluginContext): Promise<void>;
  onShutdown(): Promise<void>;
  getTools(): Promise<Tool[]>;
  getResources(): Promise<Resource[]>;
  getInstructions(): Promise<string | undefined>;
  getWebRoutes(): WebRouteDefinition[];
  requiresDaemonStartup(): boolean;
}

class InterfacePluginDelegate<
  TConfig,
  TTrackingInfo extends BaseJobTrackingInfo,
> extends RuntimeInterfacePlugin<TConfig, TTrackingInfo> {
  constructor(
    id: string,
    packageJson: { name: string; version: string; description?: string },
    config: Partial<TConfig>,
    configSchema: z.ZodTypeAny,
    private readonly hooks: InterfacePluginHooks,
  ) {
    super(id, packageJson, config, configSchema);
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

  protected override getTools(): Promise<never[]> {
    return this.hooks.getTools() as Promise<never[]>;
  }

  protected override getResources(): Promise<never[]> {
    return this.hooks.getResources() as Promise<never[]>;
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
  TConfig = unknown,
  TTrackingInfo extends BaseJobTrackingInfo = BaseJobTrackingInfo,
> implements Plugin {
  public readonly type = "interface" as const;
  public readonly id: string;
  public readonly version: string;
  public readonly packageName: string;
  public readonly description?: string;
  private readonly delegate: InterfacePluginDelegate<TConfig, TTrackingInfo>;

  protected constructor(
    id: string,
    packageJson: { name: string; version: string; description?: string },
    config: Partial<TConfig>,
    configSchema: z.ZodTypeAny,
  ) {
    this.id = id;
    this.version = packageJson.version;
    this.packageName = packageJson.name;
    if (packageJson.description !== undefined) {
      this.description = packageJson.description;
    }
    this.delegate = new InterfacePluginDelegate(
      id,
      packageJson,
      config,
      configSchema,
      {
        onRegister: (context): Promise<void> => this.onRegister(context),
        onReady: (context): Promise<void> => this.onReady(context),
        onShutdown: (): Promise<void> => this.onShutdown(),
        getTools: (): Promise<Tool[]> => this.getTools(),
        getResources: (): Promise<Resource[]> => this.getResources(),
        getInstructions: (): Promise<string | undefined> =>
          this.getInstructions(),
        getWebRoutes: (): WebRouteDefinition[] => this.getWebRoutes(),
        requiresDaemonStartup: (): boolean => this.requiresDaemonStartup(),
      },
    );
  }

  /** @internal */
  register(
    shell: IShell,
    context?: PluginRegistrationContext,
  ): Promise<PluginCapabilities> {
    return this.delegate.register(shell, context);
  }

  protected async onRegister(_context: InterfacePluginContext): Promise<void> {}
  protected async onReady(_context: InterfacePluginContext): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
  protected async getTools(): Promise<Tool[]> {
    return [];
  }
  protected async getResources(): Promise<Resource[]> {
    return [];
  }
  protected async getInstructions(): Promise<string | undefined> {
    return undefined;
  }

  getWebRoutes(): WebRouteDefinition[] {
    return [];
  }

  requiresDaemonStartup(): boolean {
    return false;
  }

  ready(): Promise<void> {
    return this.delegate.ready();
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown?.() ?? Promise.resolve();
  }
}
