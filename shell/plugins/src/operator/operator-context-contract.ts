import type { UserPermissionLevel } from "@brains/templates";
import type { z } from "@brains/utils/zod";
import type {
  AnyEntityDefinition,
  EntityOf,
} from "../entity/entity-definition-contract";
import type {
  AccountSettingsValue,
  AnyAccountSettingsDefinition,
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

export interface OperatorEntityReader {
  get<TDefinition extends AnyEntityDefinition>(
    definition: TDefinition,
    id: string,
  ): Promise<EntityOf<TDefinition> | null>;
  list<TDefinition extends AnyEntityDefinition>(
    definition: TDefinition,
  ): Promise<readonly EntityOf<TDefinition>[]>;
  search<TDefinition extends AnyEntityDefinition>(
    definition: TDefinition,
    query: string,
  ): Promise<readonly EntityOf<TDefinition>[]>;
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
  readonly settings: TAccountSettings extends AnyAccountSettingsDefinition
    ? AccountSettingsValue<TAccountSettings> | null
    : null;
  readonly entities: OperatorEntityReader;
  readonly jobs: OperatorJobs;
  readonly permissions: OperatorPermissions;
  readonly signal: AbortSignal;
}
