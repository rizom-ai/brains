import { EntityPlugin as RuntimeEntityPlugin } from "../entity/entity-plugin";
import type { EntityPluginContext as RuntimeEntityPluginContext } from "../entity/context";
import type {
  IShell,
  PluginCapabilities,
  PluginRegistrationContext,
} from "../interfaces";
import type {
  BaseEntity,
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
  DataSource,
  EntityAdapter,
  EntityTypeConfig,
} from "@brains/entity-service";
import type { z } from "@brains/utils";
import type { EntityPluginContext, Plugin } from "./types";

interface EntityPluginHooks<TEntity extends BaseEntity> {
  getEntityType(): string;
  getSchema(): z.ZodSchema<TEntity>;
  getAdapter(): EntityAdapter<TEntity>;
  onRegister(context: EntityPluginContext): Promise<void>;
  onReady(context: EntityPluginContext): Promise<void>;
  onShutdown(): Promise<void>;
  getEntityTypeConfig(): EntityTypeConfig | undefined;
  getDataSources(): DataSource[];
  getInstructions(): Promise<string | undefined>;
  interceptCreate(
    input: CreateInput,
    executionContext: CreateExecutionContext,
    context: EntityPluginContext,
  ): Promise<CreateInterceptionResult>;
}

class EntityPluginDelegate<
  TEntity extends BaseEntity,
  TConfig,
> extends RuntimeEntityPlugin<TEntity, TConfig> {
  constructor(
    id: string,
    packageJson: { name: string; version: string; description?: string },
    config: Partial<TConfig>,
    configSchema: z.ZodTypeAny,
    private readonly hooks: EntityPluginHooks<TEntity>,
  ) {
    super(id, packageJson, config, configSchema);
  }

  override get entityType(): string {
    return this.hooks.getEntityType();
  }

  override get schema(): z.ZodSchema<TEntity> {
    return this.hooks.getSchema();
  }

  override get adapter(): EntityAdapter<TEntity> {
    return this.hooks.getAdapter();
  }

  protected override onRegister(
    context: RuntimeEntityPluginContext,
  ): Promise<void> {
    return this.hooks.onRegister(context);
  }

  protected override onReady(
    context: RuntimeEntityPluginContext,
  ): Promise<void> {
    return this.hooks.onReady(context);
  }

  protected override onShutdown(): Promise<void> {
    return this.hooks.onShutdown();
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return this.hooks.getEntityTypeConfig();
  }

  protected override getDataSources(): DataSource[] {
    return this.hooks.getDataSources();
  }

  protected override getInstructions(): Promise<string | undefined> {
    return this.hooks.getInstructions();
  }

  protected override interceptCreate(
    input: CreateInput,
    executionContext: CreateExecutionContext,
    context: RuntimeEntityPluginContext,
  ): Promise<CreateInterceptionResult> {
    return this.hooks.interceptCreate(input, executionContext, context);
  }
}

export abstract class EntityPlugin<
  TEntity extends BaseEntity = BaseEntity,
  TConfig = unknown,
> implements Plugin {
  public readonly type = "entity" as const;
  public readonly id: string;
  public readonly version: string;
  public readonly packageName: string;
  public readonly description?: string;
  public abstract readonly entityType: string;
  public abstract readonly schema: z.ZodSchema<TEntity>;
  public abstract readonly adapter: EntityAdapter<TEntity>;
  private readonly delegate: EntityPluginDelegate<TEntity, TConfig>;

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
    this.delegate = new EntityPluginDelegate(
      id,
      packageJson,
      config,
      configSchema,
      {
        getEntityType: (): string => this.entityType,
        getSchema: (): z.ZodSchema<TEntity> => this.schema,
        getAdapter: (): EntityAdapter<TEntity> => this.adapter,
        onRegister: (context): Promise<void> => this.onRegister(context),
        onReady: (context): Promise<void> => this.onReady(context),
        onShutdown: (): Promise<void> => this.onShutdown(),
        getEntityTypeConfig: (): EntityTypeConfig | undefined =>
          this.getEntityTypeConfig(),
        getDataSources: (): DataSource[] => this.getDataSources(),
        getInstructions: (): Promise<string | undefined> =>
          this.getInstructions(),
        interceptCreate: (
          input,
          executionContext,
          context,
        ): Promise<CreateInterceptionResult> =>
          this.interceptCreate(input, executionContext, context),
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

  protected async onRegister(_context: EntityPluginContext): Promise<void> {}
  protected async onReady(_context: EntityPluginContext): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
  protected async getInstructions(): Promise<string | undefined> {
    return undefined;
  }
  protected getEntityTypeConfig(): EntityTypeConfig | undefined {
    return undefined;
  }
  protected getDataSources(): DataSource[] {
    return [];
  }
  protected async interceptCreate(
    input: CreateInput,
    _executionContext: CreateExecutionContext,
    _context: EntityPluginContext,
  ): Promise<CreateInterceptionResult> {
    return { kind: "continue", input };
  }

  ready(): Promise<void> {
    return this.delegate.ready();
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown?.() ?? Promise.resolve();
  }
}
