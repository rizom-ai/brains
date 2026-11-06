import type { EntityTypeClassification } from "@brains/entity-service";
import type { EntityActionPolicyRuleInput } from "@brains/templates";
import type { z } from "@brains/utils/zod";
import type { EntityDefinitionConfig } from "./entity-definition-config";

export type { EntityDefinitionConfig } from "./entity-definition-config";

export type EntityVisibility = "public" | "shared" | "restricted";
export type EntityMetadataSchema = z.ZodObject<z.ZodRawShape>;

export interface EntityMarkdownDocument<TMetadata> {
  readonly content: string;
  readonly metadata: TMetadata;
}

export interface EncodedEntityMarkdown {
  readonly content: string;
  readonly frontmatter: Record<string, unknown>;
}

export interface EntityMarkdownCodec<
  TMetadataSchema extends EntityMetadataSchema,
> {
  decode(input: {
    readonly content: string;
    readonly frontmatter: Readonly<Record<string, unknown>>;
  }): EntityMarkdownDocument<z.input<TMetadataSchema>>;
  encode(
    input: EntityMarkdownDocument<z.output<TMetadataSchema>>,
  ): EncodedEntityMarkdown;
}

/**
 * Lifecycle moments a seed may attach to, named rather than given as
 * channel strings so the public surface never names an internal channel.
 *
 * `startup-content-settled` fires once startup content is in place: after a
 * pending initial sync succeeded, or at boot when none was pending. It is
 * the only safe point to write a default, since seeding earlier could race
 * synced content and resurrect something deleted upstream. After a failed
 * sync it does not fire, so a default is never exported over unimported files.
 */
export type EntitySeedTrigger = "startup-content-settled";

/**
 * A default entity the brain should hold before anyone authors one, such
 * as a house style guide.
 *
 * Seeding is create-if-absent: an entity with this id, at any visibility,
 * is never overwritten, so a seed cannot clobber authored content.
 */
export interface EntitySeedDefinition<
  TMetadataSchema extends EntityMetadataSchema,
> {
  readonly on: EntitySeedTrigger;
  readonly id: string;
  /** Lazy, so the default is only built when it is actually needed. */
  readonly content: () => string;
  readonly metadata?: z.input<TMetadataSchema> | undefined;
}

export interface EntityDefinition<
  TType extends string = string,
  TMetadataSchema extends EntityMetadataSchema = EntityMetadataSchema,
> {
  readonly kind: "rizom-entity";
  readonly type: TType;
  readonly purpose: string;
  readonly classification: EntityTypeClassification;
  readonly metadata: TMetadataSchema;
  /**
   * Normalize stored metadata before the schema sees it, so records written
   * before a shape changed still parse. Declared beside `metadata` rather
   * than folded into it, so the schema stays an object shape. It must return
   * current metadata unchanged.
   */
  readonly metadataFrom?: ((stored: unknown) => unknown) | undefined;
  /** One authored record, whose id is the entity type. */
  readonly singleton?: boolean | undefined;
  /** False when the type has no free-form body below its frontmatter. */
  readonly hasBody?: boolean | undefined;
  readonly markdown?: EntityMarkdownCodec<TMetadataSchema> | undefined;
  /**
   * A label derived from the record, for where it is shown. Reading it never
   * writes the stored record; no label falls back to the record's own title.
   */
  displayTitle?(entity: {
    readonly content: string;
    readonly metadata: z.output<TMetadataSchema>;
  }): string | undefined;
  /** Entity-type settings; omitted keys keep the runtime defaults. */
  readonly config?: EntityDefinitionConfig | undefined;
  /**
   * A persistence invariant, checked before every create and update of this
   * type, including installs without a service. Throwing rejects the write.
   */
  readonly validatePersist?:
    | ((entity: {
        readonly content: string;
        readonly visibility: EntityVisibility;
      }) => void | Promise<void>)
    | undefined;
  /**
   * Who may do what to this type, when the platform baseline is not right:
   * this type's own rule in the brain's action policy. It overrides the
   * brain's wildcard defaults action by action, and the brain's own rules
   * for this type override it in turn. `config.actionPolicy` is the other
   * form, a minimum that only tightens the wildcard defaults.
   */
  readonly actions?: EntityActionPolicyRuleInput | undefined;
  /** Whether this type carries a cover image in `coverImageId`. */
  readonly coverImage?: boolean | undefined;
  readonly seed?: EntitySeedDefinition<TMetadataSchema> | undefined;
}

export type AnyEntityDefinition = EntityDefinition<
  string,
  EntityMetadataSchema
>;

export interface EntityOf<TDefinition extends AnyEntityDefinition> {
  readonly id: string;
  readonly entityType: TDefinition["type"];
  readonly content: string;
  readonly visibility: EntityVisibility;
  readonly metadata: z.output<TDefinition["metadata"]>;
  readonly contentHash: string;
  readonly created: string;
  readonly updated: string;
}

export interface EntityWriteInput<TDefinition extends AnyEntityDefinition> {
  readonly id: string;
  readonly content: string;
  readonly visibility?: EntityVisibility | undefined;
  readonly metadata: z.input<TDefinition["metadata"]>;
}

export interface ProjectionTarget<TTarget extends AnyEntityDefinition> {
  upsert(input: EntityWriteInput<TTarget>): Promise<void>;
}

export interface ProjectionDefinition<
  TSource extends AnyEntityDefinition = AnyEntityDefinition,
  TTarget extends AnyEntityDefinition = AnyEntityDefinition,
> {
  readonly kind: "rizom-projection";
  readonly id: string;
  readonly source: TSource;
  readonly target: TTarget;
  project(context: {
    readonly source: EntityOf<TSource>;
    readonly target: ProjectionTarget<TTarget>;
    readonly signal: AbortSignal;
  }): Promise<void>;
}
