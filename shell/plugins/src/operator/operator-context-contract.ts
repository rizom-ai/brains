import type { SdkErrorCode } from "@brains/contracts";
import type { UserPermissionLevel } from "@brains/templates";
import type { z } from "@brains/utils/zod";
import type {
  AnyEntityDefinition,
  EntityReader,
} from "../entity/entity-definition-contract";
import type {
  AccountSettingsReader,
  AnyAccountSettingsDefinition,
  RedactedAccountSettingsValue,
} from "./account-settings-definition-contract";

export type OperatorSchema = z.ZodType<unknown, unknown>;

declare const operatorBindingContext: unique symbol;
declare const ownedEntityTypes: unique symbol;

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

export interface OperatorPermissions {
  allows<TDefinition extends AnyEntityDefinition>(
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
  /**
   * Why the last attempt failed, as its public message: never the message
   * the failure was thrown with, which stays in the brain's logs.
   */
  readonly error?: string | undefined;
  /** The code of the last attempt's failure, when it failed. */
  readonly code?: SdkErrorCode | undefined;
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

/**
 * What a slot binds its operator definitions to. A service's carries the
 * entity types its header owns, which its workspace actions write; an entity
 * type's and a first-party binding's own none.
 */
export interface OperatorBindingContext<
  TConfig,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  TOwned extends AnyEntityDefinition = never,
> {
  readonly config: TConfig;
  readonly state: TState;
  readonly accountSettings: TAccountSettings;
  /**
   * Type-only: the entity types the binding package owns. A method, so a
   * binding context is read for its types without constraining which slot
   * may hand it.
   */
  [ownedEntityTypes]?(owned: TOwned): void;
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
  /**
   * Reads the package's own settings for the caller's account, every field
   * and each secret sealed until revealed, for the server-side call that
   * needs it. A sealed secret serializes as a redacted marker.
   */
  readonly accountSettings: AccountSettingsReader<
    NonNullable<TAccountSettings>
  >;
  /**
   * Definition-typed reads as the caller, at their visibility. Inside a
   * service, the package's other capabilities act as the caller too.
   */
  readonly entities: EntityReader;
  readonly jobs: OperatorJobs;
  readonly permissions: OperatorPermissions;
  readonly signal: AbortSignal;
}
