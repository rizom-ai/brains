import type { UserPermissionLevel } from "@brains/templates";
import type { z } from "@brains/utils/zod";
import type {
  BaseEntity,
  ProjectSemanticSpaceRequest,
  SemanticSpaceProjection,
} from "@brains/entity-service";
import type { EntityDefinitionShape, EntityOf } from "../entity/entity-shape";
import type {
  AnyAccountSettingsDefinition,
  RedactedAccountSettingsValue,
} from "./account-settings-definition-contract";

export type OperatorSchema = z.ZodType<unknown, unknown>;

declare const operatorBindingContext: unique symbol;

export interface OperatorBindingBrand<
  TConfig,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> {
  readonly [operatorBindingContext]?: (
    value: OperatorBaseContext<TConfig, TState, TAccountSettings>,
  ) => void;
}

export interface OperatorActor {
  readonly id: string;
  readonly displayName?: string | undefined;
}

export interface OperatorCaller {
  readonly actor: OperatorActor;
  readonly permission: UserPermissionLevel;
  readonly isAnchor: boolean;
}

export interface OperatorQueryReader {
  /** Read the host-validated query through the exact schema declared by the workspace. */
  get<TSchema extends OperatorSchema>(schema: TSchema): z.output<TSchema>;
}

/**
 * Corpus-wide reads: where entities sit relative to each other, and the
 * titles to label them with. See `OperatorBaseContext.corpus`.
 */
export interface OperatorCorpusReader {
  /** Coordinates only — no content crosses this call. */
  project(
    request: ProjectSemanticSpaceRequest,
  ): Promise<SemanticSpaceProjection>;
  listEntities(request: { entityType: string }): Promise<BaseEntity[]>;
}

export interface OperatorEntityReader {
  get<TDefinition extends EntityDefinitionShape>(
    definition: TDefinition,
    id: string,
  ): Promise<EntityOf<TDefinition> | null>;
  list<TDefinition extends EntityDefinitionShape>(
    definition: TDefinition,
  ): Promise<readonly EntityOf<TDefinition>[]>;
  search<TDefinition extends EntityDefinitionShape>(
    definition: TDefinition,
    query: string,
  ): Promise<readonly EntityOf<TDefinition>[]>;
}

export interface OperatorPermissions {
  allows<TDefinition extends EntityDefinitionShape>(
    definition: TDefinition,
    action: "create" | "update" | "delete" | "extract" | "publish",
  ): boolean;
}

export interface OperatorJobDefinition<
  TInputSchema extends OperatorSchema = OperatorSchema,
  TOutputSchema extends OperatorSchema = OperatorSchema,
> {
  readonly kind: "rizom-service-job";
  readonly name: string;
  readonly input: TInputSchema;
  readonly output: TOutputSchema;
}

export interface OperatorJobStatus<TOutput> {
  readonly id: string;
  readonly status: "pending" | "processing" | "completed" | "failed";
  readonly result?: TOutput | undefined;
  readonly error?: string | undefined;
}

export interface OperatorJobReference<
  TDefinition extends OperatorJobDefinition,
> {
  readonly id: string;
  status(): Promise<OperatorJobStatus<z.output<TDefinition["output"]>> | null>;
}

export interface OperatorJobs {
  enqueue<TDefinition extends OperatorJobDefinition>(
    definition: TDefinition,
    input: z.input<TDefinition["input"]>,
  ): Promise<OperatorJobReference<TDefinition>>;
  status<TDefinition extends OperatorJobDefinition>(
    definition: TDefinition,
    id: string,
  ): Promise<OperatorJobStatus<z.output<TDefinition["output"]>> | null>;
}

export interface OperatorBindingContext<
  TConfig,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> {
  readonly config: TConfig;
  readonly state: TState;
  readonly accountSettings: TAccountSettings;
}

export interface OperatorBaseContext<
  TConfig,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> {
  readonly config: TConfig;
  readonly state: TState;
  readonly caller: OperatorCaller | null;
  /**
   * The current caller's settings, minus every field declared `secret`.
   * Operator data reaches the browser, so secrets are excluded from the type
   * rather than left to author discipline.
   */
  readonly settings: RedactedAccountSettingsValue<
    NonNullable<TAccountSettings>
  > | null;
  readonly entities: OperatorEntityReader;
  /**
   * The corpus as a whole, for a surface whose subject is its shape rather
   * than any one type.
   *
   * `entities` above is definition-typed on purpose — operator data reaches
   * the browser, and asking through a declaration is what keeps a widget
   * from serving whatever it likes. A map of the entire brain has no
   * declaration to ask through: `project({})` takes no type filter. Reads
   * are capped at the caller's visibility like every other operator read.
   * Named consumer: @brains/knowledge-map.
   */
  readonly corpus: OperatorCorpusReader;
  readonly jobs: OperatorJobs;
  readonly permissions: OperatorPermissions;
  readonly signal: AbortSignal;
}
