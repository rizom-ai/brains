import type {
  BaseEntity,
  CreateInterceptor,
  DataSource,
  PersistValidator,
  UploadSaveHandlerRegistration,
  EntityAdapter,
  EntityTypeConfig,
  EntityGrouping,
  IEntitiesNamespace,
  IEntityService,
} from "@brains/entity-service";
import type { JsonObject } from "@brains/contracts";
import type { OutputFormat, Renderer, ViewTemplate } from "@brains/templates";
import type { IShell } from "../interfaces";
import { resolvePrompt } from "./prompt-resolver";

/**
 * Prompts namespace — resolves AI prompts from prompt entities
 */
export interface IPromptsNamespace {
  /** Resolve a prompt by target name. Returns entity content if found, fallback otherwise. */
  resolve: (target: string, fallback: string) => Promise<string>;
}

/**
 * Views namespace — view template access and rendering utilities
 */
export interface IViewsNamespace {
  /** Get a view template by name */
  get: (name: string) => ViewTemplate | undefined;

  /** List all registered view templates */
  list: () => ViewTemplate[];

  /** Check if a template has a renderer for the requested format (defaults to web). */
  hasRenderer: (templateName: string, format?: OutputFormat) => boolean;

  /** Get the renderer for a template and format (defaults to web). */
  getRenderer: (
    templateName: string,
    format?: OutputFormat,
  ) => Renderer<JsonObject> | undefined;

  /** Validate content against a template's schema */
  validate: (templateName: string, content: unknown) => boolean;
}

type EntitySchema<TEntity extends BaseEntity> =
  EntityAdapter<TEntity>["schema"];
type FrontmatterSchema = NonNullable<
  EntityAdapter<BaseEntity>["frontmatterSchema"]
>;

/**
 * Create the shared entity-management namespace used by entity and service
 * plugin contexts.
 */
export function createEntitiesNamespace(shell: IShell): IEntitiesNamespace {
  const entityService = shell.getEntityService();
  const entityRegistry = shell.getEntityRegistry();
  const dataSourceRegistry = shell.getDataSourceRegistry();

  return {
    registerGroupingSource: (source): void =>
      entityRegistry.registerGroupingSource(source),
    ensureGroupingsCurrent: (): Promise<void> =>
      entityRegistry.ensureGroupingsCurrent(),
    validateGroupings: (groupings: readonly EntityGrouping[]): void =>
      entityRegistry.validateGroupings(groupings),
    replaceGroupings: (groupings, options): void =>
      entityRegistry.replaceGroupings(groupings, options),
    registerGrouping: (grouping: EntityGrouping): void =>
      entityRegistry.registerGrouping(grouping),
    getGroupings: (): EntityGrouping[] => entityRegistry.getGroupings(),
    isGroupingContributor: (type: string): boolean =>
      entityRegistry.isGroupingContributor(type),
    register: <T extends BaseEntity>(
      entityType: string,
      schema: EntitySchema<T>,
      adapter: EntityAdapter<T>,
      config?: EntityTypeConfig,
    ): void => {
      entityRegistry.registerEntityType(entityType, schema, adapter, config);
    },
    getAdapter: (entityType: string): EntityAdapter<BaseEntity> | undefined => {
      try {
        return entityRegistry.getAdapter(entityType);
      } catch {
        return undefined;
      }
    },
    extendFrontmatterSchema: (
      type: string,
      extension: FrontmatterSchema,
    ): void => {
      entityRegistry.extendFrontmatterSchema(type, extension);
    },
    getEffectiveFrontmatterSchema: (
      type: string,
    ): FrontmatterSchema | undefined => {
      return entityRegistry.getEffectiveFrontmatterSchema(type);
    },
    registerPersistValidator: (
      entityType: string,
      validator: PersistValidator,
    ): void => {
      entityRegistry.registerPersistValidator(entityType, validator);
    },
    registerCreateInterceptor: (
      entityType: string,
      interceptor: CreateInterceptor,
    ): void => {
      entityRegistry.registerCreateInterceptor(entityType, interceptor);
    },
    registerUploadSaveHandler: (
      registration: UploadSaveHandlerRegistration,
    ): void => {
      entityRegistry.registerUploadSaveHandler(registration);
    },
    getUploadSaveHandler: (
      mediaType: string,
    ): UploadSaveHandlerRegistration | undefined => {
      return entityRegistry.getUploadSaveHandler(mediaType);
    },
    update: async <T extends BaseEntity>(
      entity: T,
    ): Promise<{ entityId: string; jobId: string }> => {
      return entityService.updateEntity({ entity: entity });
    },
    registerDataSource: (dataSource: DataSource): void => {
      dataSourceRegistry.register(dataSource);
    },
  };
}

/** Create the shared prompt-resolution namespace. */
export function createPromptsNamespace(
  entityService: IEntityService,
): IPromptsNamespace {
  return {
    resolve: (target: string, fallback: string): Promise<string> => {
      return resolvePrompt(entityService, target, fallback);
    },
  };
}

/** Create the shared view-template namespace. */
export function createViewsNamespace(shell: IShell): IViewsNamespace {
  const renderService = shell.getRenderService();
  return {
    get: (name: string): ViewTemplate | undefined => renderService.get(name),
    list: (): ViewTemplate[] => renderService.list(),
    hasRenderer: (
      templateName: string,
      format: OutputFormat = "web",
    ): boolean => renderService.hasRenderer(templateName, format),
    getRenderer: (
      templateName: string,
      format: OutputFormat = "web",
    ): Renderer<JsonObject> | undefined =>
      renderService.getRenderer(templateName, format),
    validate: (templateName: string, content: unknown): boolean =>
      renderService.validate(templateName, content),
  };
}
