import { ServicePlugin as RuntimeServicePlugin } from "../service/service-plugin";
import type {
  IShell,
  PluginCapabilities,
  PluginRegistrationContext,
} from "../interfaces";
import type { z } from "@brains/utils";
import type { Plugin, Resource, ServicePluginContext, Tool } from "./types";

interface ServicePluginHooks {
  onRegister(context: ServicePluginContext): Promise<void>;
  onReady(context: ServicePluginContext): Promise<void>;
  onShutdown(): Promise<void>;
  getTools(): Promise<Tool[]>;
  getResources(): Promise<Resource[]>;
  getInstructions(): Promise<string | undefined>;
}

class ServicePluginDelegate<TConfig> extends RuntimeServicePlugin<TConfig> {
  constructor(
    id: string,
    packageJson: { name: string; version: string; description?: string },
    config: Partial<TConfig>,
    configSchema: z.ZodTypeAny,
    private readonly hooks: ServicePluginHooks,
  ) {
    super(id, packageJson, config, configSchema);
  }

  protected override onRegister(context: never): Promise<void> {
    return this.hooks.onRegister(context as ServicePluginContext);
  }

  protected override onReady(context: never): Promise<void> {
    return this.hooks.onReady(context as ServicePluginContext);
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
}

export abstract class ServicePlugin<TConfig = unknown> implements Plugin {
  public readonly type = "service" as const;
  public readonly id: string;
  public readonly version: string;
  public readonly packageName: string;
  public readonly description?: string;
  private readonly delegate: ServicePluginDelegate<TConfig>;

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
    this.delegate = new ServicePluginDelegate(
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

  protected async onRegister(_context: ServicePluginContext): Promise<void> {}
  protected async onReady(_context: ServicePluginContext): Promise<void> {}
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

  ready(): Promise<void> {
    return this.delegate.ready();
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown?.() ?? Promise.resolve();
  }
}
