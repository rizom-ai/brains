import type { PluginConfigSchema } from "../config";
import type {
  IShell,
  PluginCapabilities,
  PluginRegistrationContext,
} from "../interfaces";
import type { Plugin, Resource, Tool } from "./types";

export interface PluginPackageJson {
  name: string;
  version: string;
  description?: string;
}

/**
 * The slice of a runtime plugin the public wrapper drives.
 *
 * Deliberately not a type parameter of PublicPlugin: a type argument in a
 * heritage clause survives `stripInternal`, so parameterizing by the delegate
 * would publish the concrete delegate class names into the package's public
 * .d.ts. Held behind @internal/private members instead, none of this reaches
 * the published surface.
 */
export interface RuntimePluginDelegate {
  register(
    shell: IShell,
    context?: PluginRegistrationContext,
  ): Promise<PluginCapabilities>;
  ready(): Promise<void>;
  shutdown?(): Promise<void>;
}

/** The hooks every tool-bearing plugin kind forwards to its runtime delegate. */
export interface CommonPluginHooks<TContext> {
  onRegister(context: TContext): Promise<void>;
  onReady(context: TContext): Promise<void>;
  onShutdown(): Promise<void>;
  getTools(): Promise<Tool[]>;
  getResources(): Promise<Resource[]>;
  getInstructions(): Promise<string | undefined>;
}

/**
 * Shared scaffolding for the public plugin classes.
 *
 * Each public class exposes a curated surface to external authors while a
 * runtime subclass — the delegate — does the real work. This base owns the
 * identity fields and the register/ready/shutdown forwarding that every kind
 * otherwise repeats.
 */
export abstract class PublicPlugin<TConfig, TConfigInput> implements Plugin {
  public abstract readonly type: Plugin["type"];
  public readonly id: string;
  public readonly version: string;
  public readonly packageName: string;
  public readonly description?: string;

  /** @internal */
  protected readonly packageJson: PluginPackageJson;
  /** @internal */
  protected readonly pluginConfig: TConfigInput;
  /** @internal */
  protected readonly configSchema: PluginConfigSchema<TConfig>;

  private delegateInstance: RuntimePluginDelegate | undefined;

  protected constructor(
    id: string,
    packageJson: PluginPackageJson,
    config: TConfigInput,
    configSchema: PluginConfigSchema<TConfig>,
  ) {
    this.id = id;
    this.version = packageJson.version;
    this.packageName = packageJson.name;
    if (packageJson.description !== undefined) {
      this.description = packageJson.description;
    }
    this.packageJson = packageJson;
    this.pluginConfig = config;
    this.configSchema = configSchema;
  }

  /**
   * Built on first use rather than in the constructor, so a subclass that
   * overrides createDelegate() replaces its parent's delegate instead of
   * standing up a second, unused one alongside it.
   *
   * @internal
   */
  protected get delegate(): RuntimePluginDelegate {
    this.delegateInstance ??= this.createDelegate();
    return this.delegateInstance;
  }

  /** @internal */
  protected abstract createDelegate(): RuntimePluginDelegate;

  /** @internal */
  register(
    shell: IShell,
    context?: PluginRegistrationContext,
  ): Promise<PluginCapabilities> {
    return this.delegate.register(shell, context);
  }

  ready(): Promise<void> {
    return this.delegate.ready();
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown?.() ?? Promise.resolve();
  }
}

/**
 * Adds the default no-op hooks shared by the service and interface kinds.
 * Entity plugins have a different hook set and extend PublicPlugin directly.
 */
export abstract class HookedPublicPlugin<
  TConfig,
  TConfigInput,
  TContext,
> extends PublicPlugin<TConfig, TConfigInput> {
  protected async onRegister(_context: TContext): Promise<void> {}
  protected async onReady(_context: TContext): Promise<void> {}
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

  /** @internal */
  protected commonHooks(): CommonPluginHooks<TContext> {
    return {
      onRegister: (context): Promise<void> => this.onRegister(context),
      onReady: (context): Promise<void> => this.onReady(context),
      onShutdown: (): Promise<void> => this.onShutdown(),
      getTools: (): Promise<Tool[]> => this.getTools(),
      getResources: (): Promise<Resource[]> => this.getResources(),
      getInstructions: (): Promise<string | undefined> =>
        this.getInstructions(),
    };
  }
}
