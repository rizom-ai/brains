import type { Logger } from "@brains/utils/logger";
import { baseEntitySchema, contentVisibilitySchema } from "./types";
import {
  projectFrontmatterExtensions,
  type InvalidFieldPolicy,
} from "./frontmatter-extensions";
import { z } from "@brains/utils/zod";
import {
  getArrayElement,
  getObjectShape,
  haveSameStringListContract,
  readEnumValues,
  readLiteralValue,
  unwrapField,
} from "@brains/utils/zod-introspect";
import { parseMarkdownWithFrontmatter } from "./frontmatter";
import {
  entityGroupingSchema,
  GROUPING_RESERVED_FIELDS,
  type EntityGrouping,
} from "./entity-grouping";
import type {
  BaseEntity,
  CreateInterceptor,
  UploadSaveHandlerRegistration,
  EntityAdapter,
  EntityRegistry as IEntityRegistry,
  EntityTypeConfig,
  PersistValidator,
  FrontmatterSchema,
  UnknownEntitySchema,
} from "./types";

/** Registry for entity types. */
export class EntityRegistry implements IEntityRegistry {
  private entitySchemas = new Map<string, UnknownEntitySchema>();
  private entityAdapters = new Map<string, EntityAdapter<BaseEntity>>();
  private entityConfigs = new Map<string, EntityTypeConfig>();
  private createInterceptors = new Map<string, CreateInterceptor>();
  private uploadSaveHandlers: UploadSaveHandlerRegistration[] = [];
  private persistValidators = new Map<string, PersistValidator>();
  private frontmatterExtensions = new Map<string, FrontmatterSchema[]>();
  private logger: Logger;
  private groupings = new Map<string, EntityGrouping>();

  public static createFresh(logger: Logger): EntityRegistry {
    return new EntityRegistry(logger);
  }

  private constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Register a new entity type with its schema and adapter
   */
  registerEntityType<
    TEntity extends BaseEntity<TMetadata>,
    TMetadata extends Record<string, unknown> = Record<string, unknown>,
  >(
    type: string,
    schema: UnknownEntitySchema,
    adapter: EntityAdapter<TEntity, TMetadata>,
    config?: EntityTypeConfig,
  ): void {
    this.logger.debug(`Registering entity type: ${type}`);

    // Check for duplicate registration
    if (this.entitySchemas.has(type)) {
      throw new Error(
        `Entity type registration failed for ${type}: Entity type is already registered`,
      );
    }

    // Schema validation handled by Zod - works correctly with extended schemas

    // Register schema, adapter, and config
    this.entitySchemas.set(type, schema);
    this.entityAdapters.set(type, adapter);
    if (config) {
      this.entityConfigs.set(type, config);
    }

    this.logger.debug(`Registered entity type: ${type}`);
  }

  unregisterEntityType(type: string): void {
    this.entitySchemas.delete(type);
    this.entityAdapters.delete(type);
    this.entityConfigs.delete(type);
    this.createInterceptors.delete(type);
    this.persistValidators.delete(type);
    this.frontmatterExtensions.delete(type);
    this.uploadSaveHandlers = this.uploadSaveHandlers.filter(
      (registration) => registration.entityType !== type,
    );
    this.logger.debug(`Unregistered entity type: ${type}`);
  }

  /**
   * Get schema for a specific entity type
   */
  getSchema(type: string): UnknownEntitySchema {
    const schema = this.entitySchemas.get(type);
    if (!schema) {
      throw new Error(
        `Entity type registration failed for ${type}: No schema registered for entity type`,
      );
    }
    return schema;
  }

  /**
   * Get adapter for a specific entity type.
   * If frontmatter extensions have been registered, returns a wrapper with the effective merged schema.
   */
  getAdapter(type: string): EntityAdapter<BaseEntity> {
    const adapter = this.entityAdapters.get(type);
    if (!adapter) {
      throw new Error(
        `Entity type registration failed for ${type}: No adapter registered for entity type`,
      );
    }

    const effectiveSchema = this.mergeExtensions(
      type,
      adapter.frontmatterSchema,
    );
    if (!effectiveSchema || effectiveSchema === adapter.frontmatterSchema) {
      return adapter;
    }

    // Delegate to the adapter, overriding only frontmatterSchema.
    const wrapped: EntityAdapter<BaseEntity> = Object.create(adapter);
    Object.defineProperty(wrapped, "frontmatterSchema", {
      value: effectiveSchema,
      enumerable: true,
    });
    return wrapped;
  }

  /**
   * Check if an entity type is registered
   */
  hasEntityType(type: string): boolean {
    return this.entitySchemas.has(type) && this.entityAdapters.has(type);
  }

  /**
   * Validate entity against its schema
   */
  validateEntity(type: string, entity: unknown): BaseEntity {
    const schema = this.getSchema(type);
    const parsed = schema.parse(this.normalizePolicyFields(entity, type));
    const base = baseEntitySchema.parse(parsed);
    const parsedFields =
      parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? Object.fromEntries(Object.entries(parsed))
        : {};
    return {
      ...parsedFields,
      id: base.id,
      entityType: base.entityType,
      content: base.content,
      created: base.created,
      updated: base.updated,
      visibility: base.visibility,
      metadata: this.projectMetadata(type, base.content, base.metadata),
      contentHash: base.contentHash,
    };
  }

  private normalizePolicyFields(entity: unknown, type: string): unknown {
    if (
      entity === null ||
      typeof entity !== "object" ||
      Array.isArray(entity)
    ) {
      return entity;
    }

    const normalized = Object.fromEntries(Object.entries(entity));
    normalized["visibility"] = contentVisibilitySchema.parse(
      normalized["visibility"],
    );
    const metadata = normalized["metadata"];
    const ownerMetadata = getObjectShape(
      unwrapField(getObjectShape(this.getSchema(type))?.["metadata"]).inner,
    );
    if (
      ownerMetadata &&
      metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata)
    ) {
      const owned = Object.fromEntries(Object.entries(metadata));
      for (const extension of this.getFrontmatterExtensions(type)) {
        for (const key of Object.keys(extension.shape)) {
          if (!Object.hasOwn(ownerMetadata, key)) delete owned[key];
        }
      }
      normalized["metadata"] = owned;
    }
    return normalized;
  }

  /**
   * Get all registered entity types
   */
  getAllEntityTypes(): string[] {
    return Array.from(this.entitySchemas.keys());
  }

  /**
   * Get configuration for a specific entity type
   */
  getEntityTypeConfig(type: string): EntityTypeConfig {
    return this.entityConfigs.get(type) ?? {};
  }

  /**
   * Get weight map for all registered entity types with non-default weights
   */
  getWeightMap(): Record<string, number> {
    const weightMap: Record<string, number> = {};
    for (const [type, config] of this.entityConfigs) {
      if (config.weight !== undefined) {
        weightMap[type] = config.weight;
      }
    }
    return weightMap;
  }

  registerCreateInterceptor(
    type: string,
    interceptor: CreateInterceptor,
  ): void {
    this.createInterceptors.set(type, interceptor);
  }

  getCreateInterceptor(type: string): CreateInterceptor | undefined {
    return this.createInterceptors.get(type);
  }

  registerUploadSaveHandler(registration: UploadSaveHandlerRegistration): void {
    this.uploadSaveHandlers = [
      ...this.uploadSaveHandlers.filter(
        (existing) => existing.entityType !== registration.entityType,
      ),
      registration,
    ];
  }

  getUploadSaveHandler(
    mediaType: string,
  ): UploadSaveHandlerRegistration | undefined {
    return this.uploadSaveHandlers.find((registration) =>
      registration.mediaTypes.some((pattern) =>
        pattern.endsWith("/*")
          ? mediaType.startsWith(`${pattern.slice(0, -1)}`)
          : mediaType === pattern,
      ),
    );
  }

  registerPersistValidator(type: string, validator: PersistValidator): void {
    const existing = this.persistValidators.get(type);
    this.persistValidators.set(
      type,
      existing
        ? async (entity, context): Promise<void> => {
            await existing(entity, context);
            await validator(entity, context);
          }
        : validator,
    );
  }

  getPersistValidator(type: string): PersistValidator | undefined {
    return this.persistValidators.get(type);
  }

  /**
   * Extend an adapter's frontmatterSchema with additional fields.
   * Extensions are merged into the effective schema returned by getEffectiveFrontmatterSchema().
   */
  extendFrontmatterSchema(type: string, extension: FrontmatterSchema): void {
    const adapter = this.entityAdapters.get(type);
    if (!adapter) {
      throw new Error(
        `Cannot extend frontmatter schema for ${type}: entity type is not registered`,
      );
    }
    if (!adapter.frontmatterSchema) {
      throw new Error(
        `Cannot extend frontmatter schema for ${type}: adapter has no frontmatterSchema`,
      );
    }

    for (const grouping of this.groupings.values()) {
      if (
        grouping.types.includes(type) &&
        Object.hasOwn(extension.shape, grouping.field) &&
        extension.shape[grouping.field] !==
          this.getEffectiveFrontmatterSchema(type)?.shape[grouping.field]
      ) {
        throw new Error(
          `Cannot replace registered grouping field ${type}.${grouping.field}`,
        );
      }
    }
    const existing = this.frontmatterExtensions.get(type) ?? [];
    existing.push(extension);
    this.frontmatterExtensions.set(type, existing);

    this.logger.debug(`Extended frontmatter schema for entity type: ${type}`);
  }

  /** Validate a whole configuration without publishing partial extensions. */
  validateGroupings(groupings: readonly EntityGrouping[]): void {
    const staged = new EntityRegistry(this.logger.child("GroupingValidation"));
    staged.entitySchemas = this.entitySchemas;
    staged.entityAdapters = this.entityAdapters;
    staged.entityConfigs = this.entityConfigs;
    staged.frontmatterExtensions = new Map(
      [...this.frontmatterExtensions].map(([type, schemas]) => [
        type,
        [...schemas],
      ]),
    );
    staged.groupings = new Map(this.groupings);
    for (const grouping of groupings) staged.registerGrouping(grouping);
  }

  registerGrouping(input: EntityGrouping): void {
    const grouping = entityGroupingSchema.parse(input);
    if (this.groupings.has(grouping.key))
      throw new Error(`Duplicate entity grouping: ${grouping.key}`);
    if (GROUPING_RESERVED_FIELDS.has(grouping.field))
      throw new Error("Grouping field is reserved");
    const additions: string[] = [];
    // Validate every contributor before applying any schema extension.
    for (const type of grouping.types) {
      const schema = this.getEffectiveFrontmatterSchema(type);
      if (
        !this.hasEntityType(type) ||
        !schema ||
        this.getEntityTypeConfig(type).binaryStorage === "asset"
      ) {
        throw new Error(
          `Grouping requires a registered frontmatter entity type: ${type}`,
        );
      }
      const field = schema.shape[grouping.field];
      const ownerField =
        this.entityAdapters.get(type)?.frontmatterSchema?.shape[grouping.field];
      if (ownerField && ownerField !== field) {
        throw new Error(
          `Grouping field overrides an owner contract: ${type}.${grouping.field}`,
        );
      }
      const metadataField = getObjectShape(
        unwrapField(getObjectShape(this.getSchema(type))?.["metadata"]).inner,
      )?.[grouping.field];
      if (!field) {
        if (metadataField)
          throw new Error(
            `Grouping conflicts with metadata field ${type}.${grouping.field}`,
          );
        additions.push(type);
        continue;
      }
      const element = getArrayElement(unwrapField(field).inner);
      const inner = unwrapField(element).inner;
      if (
        element !== inner ||
        (!(inner instanceof z.ZodString) &&
          !readEnumValues(inner) &&
          typeof readLiteralValue(inner) !== "string")
      ) {
        throw new Error(
          `Grouping field must be a string list: ${type}.${grouping.field}`,
        );
      }
      // Reuse independently declared shapes only when runtime checks also
      // match. JSON Schema alone cannot prove refinement/transform equality.
      if (metadataField && !haveSameStringListContract(metadataField, field)) {
        throw new Error(
          `Cannot establish a shared frontmatter/metadata contract for ${type}.${grouping.field}`,
        );
      }
    }
    for (const type of additions) {
      this.extendFrontmatterSchema(
        type,
        z.object({ [grouping.field]: z.array(z.string()).optional() }),
      );
    }
    this.groupings.set(grouping.key, grouping);
  }

  getGrouping(key: string): EntityGrouping {
    const grouping = this.groupings.get(key);
    if (!grouping) throw new Error("Unknown entity grouping");
    return { ...grouping, types: [...grouping.types] };
  }

  getGroupings(): EntityGrouping[] {
    return [...this.groupings.keys()].map((key) => this.getGrouping(key));
  }

  /** Write path: a submitted membership value that fails its own schema is an error. */
  projectMetadata(
    type: string,
    content: string,
    metadata: Record<string, unknown>,
  ): Record<string, unknown> {
    return this.projectRegisteredFields(type, content, metadata, "reject");
  }

  /**
   * Bootstrap path over already-stored content: an invalid registered value is
   * omitted from the projection and left untouched in source, never fatal.
   */
  projectStoredMetadata(
    type: string,
    content: string,
    metadata: Record<string, unknown>,
  ): Record<string, unknown> {
    return this.projectRegisteredFields(type, content, metadata, "omit");
  }

  groupingFields(type: string): string[] {
    return [
      ...new Set(
        [...this.groupings.values()]
          .filter((grouping) => grouping.types.includes(type))
          .map((grouping) => grouping.field),
      ),
    ];
  }

  isGroupingContributor(type: string): boolean {
    for (const grouping of this.groupings.values())
      if (grouping.types.includes(type)) return true;
    return false;
  }

  /**
   * Each registered field is validated against its own schema entry. A sibling
   * the entity owner rejects belongs to owner validation; it must not decide
   * whether this entity is a member of a collection.
   */
  private projectRegisteredFields(
    type: string,
    content: string,
    metadata: Record<string, unknown>,
    invalid: InvalidFieldPolicy,
  ): Record<string, unknown> {
    // One parse feeds both projections; a bulk pass sees each row once, so it
    // must not leave the document in gray-matter's process-lifetime cache.
    const source = parseMarkdownWithFrontmatter(
      content,
      z.record(z.string(), z.unknown()),
      { cache: invalid === "omit" ? false : true },
    ).metadata;
    const projected = projectFrontmatterExtensions(
      source,
      metadata,
      this.getFrontmatterExtensions(type),
      invalid,
    );
    const fields = this.groupingFields(type);
    if (fields.length === 0) return projected;
    const schema = this.getEffectiveFrontmatterSchema(type);
    if (!schema)
      throw new Error("Grouping contributor lost its frontmatter schema");
    const result = { ...projected };
    for (const field of fields) {
      delete result[field];
      const fieldSchema = schema.shape[field];
      if (!fieldSchema || !Object.hasOwn(source, field)) continue;
      const parsed = z.safeParse(fieldSchema, source[field]);
      if (!parsed.success) {
        if (invalid === "reject") throw parsed.error;
        continue;
      }
      if (parsed.data !== undefined) result[field] = parsed.data;
    }
    return result;
  }

  getFrontmatterExtensions(type: string): readonly FrontmatterSchema[] {
    return [...(this.frontmatterExtensions.get(type) ?? [])];
  }

  /**
   * Get the effective frontmatter schema for an entity type,
   * with all registered extensions merged in.
   * Returns undefined if the adapter has no frontmatterSchema.
   */
  getEffectiveFrontmatterSchema(type: string): FrontmatterSchema | undefined {
    const adapter = this.entityAdapters.get(type);
    return this.mergeExtensions(type, adapter?.frontmatterSchema);
  }

  /**
   * Merge registered frontmatter extensions into a base schema.
   * Returns the base schema unchanged if no extensions exist,
   * or undefined if the base schema is undefined.
   */
  private mergeExtensions(
    type: string,
    baseSchema?: FrontmatterSchema,
  ): FrontmatterSchema | undefined {
    if (!baseSchema) {
      return undefined;
    }

    const extensions = this.frontmatterExtensions.get(type);
    if (!extensions?.length) {
      return baseSchema;
    }

    let merged = baseSchema;
    for (const ext of extensions) {
      merged = merged.safeExtend(ext.shape);
    }
    return merged.superRefine((value, context) => {
      for (const extension of extensions) {
        const extensionValue = Object.fromEntries(
          Object.keys(extension.shape).flatMap((key) =>
            Object.hasOwn(value, key) ? [[key, value[key]]] : [],
          ),
        );
        const result = extension.safeParse(extensionValue);
        if (!result.success) {
          for (const issue of result.error.issues) {
            context.addIssue({
              code: "custom",
              path: [...issue.path],
              message: issue.message,
            });
          }
        }
      }
    });
  }
}
