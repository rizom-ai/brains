import type { ProjectionSourceRole } from "@brains/entity-service";
import type { Template } from "@brains/templates";
import type { AnyEntityDataSourceDefinition } from "../public/entity-data-source";
import type { z } from "@brains/utils/zod";

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
 * Declarative subset of EntityTypeConfig an author may set. Omitted
 * fields keep the runtime defaults (`embeddable` and `projectionSource`
 * both default to true), so this only needs to carry deliberate opt-outs
 * such as system-configuration types that must stay out of search
 * embeddings and out of projection sourcing.
 */
export interface EntityDefinitionConfig {
  // Bare optionals, not `| undefined` unions: the repo runs
  // exactOptionalPropertyTypes, and these must stay assignable to
  // EntityTypeConfig, which declares them the same way.
  readonly weight?: number;
  readonly embeddable?: boolean;
  readonly projectionSource?: boolean;
  readonly projectionSourceRole?: ProjectionSourceRole;
}

/**
 * Lifecycle moments a seed may attach to. Named rather than raw channel
 * strings so the public surface does not leak internal channel names.
 *
 * `content-sync-completed` fires once the initial content sync has
 * finished, which is the only safe point to write a default: seeding
 * earlier would race synced content and could resurrect something the
 * author deleted upstream.
 */
export type EntitySeedTrigger = "content-sync-completed";

/**
 * Declares a default entity the brain should hold even before anyone
 * edits one — a singleton like a house style guide.
 *
 * Seeding is create-if-absent: an existing entity with this id is never
 * overwritten, so a seed cannot clobber authored content.
 */
export interface EntitySeedDefinition<
  TMetadataSchema extends EntityMetadataSchema,
> {
  readonly on: EntitySeedTrigger;
  readonly id: string;
  /** Lazy so the default is only built when it is actually needed. */
  readonly content: () => string;
  readonly metadata?: z.input<TMetadataSchema>;
}

export interface EntityDefinition<
  TType extends string = string,
  TMetadataSchema extends EntityMetadataSchema = EntityMetadataSchema,
> {
  readonly kind: "rizom-entity";
  readonly type: TType;
  readonly purpose: string;
  readonly metadata: TMetadataSchema;
  readonly markdown?: EntityMarkdownCodec<TMetadataSchema> | undefined;
  readonly config?: EntityDefinitionConfig | undefined;
  readonly seed?: EntitySeedDefinition<TMetadataSchema> | undefined;
  /** Keyed by local template name; the runtime scopes them to the plugin. */
  readonly templates?: Record<string, Template> | undefined;
  /** Declared data sources; the runtime scopes their ids to the package. */
  readonly dataSources?: readonly AnyEntityDataSourceDefinition[] | undefined;
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
