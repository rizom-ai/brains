import type { UserPermissionLevel } from "@brains/templates";
import type { z } from "@brains/utils/zod";
import type {
  AnyEntityDefinition,
  EntityReader,
} from "../entity/entity-definition-contract";
import type { OwnedEntityWriter } from "../entity/owned-entity-writer";
import { assertIdentifier } from "../package-definition";
import type { AnyAccountSettingsDefinition } from "./account-settings-definition-contract";
import { assertPermission, assertText } from "./contract-assertions";
import type {
  OperatorBaseContext,
  OperatorBindingBrand,
  OperatorBindingContext,
  OperatorSchema,
} from "./operator-context-contract";

export type WorkspaceActionConfirmation =
  | { readonly kind: "static"; readonly message: string }
  | { readonly kind: "prepared"; readonly conditional?: boolean | undefined };

export interface WorkspacePreparedConfirmation {
  readonly summary: string;
  readonly revision: string;
}

/**
 * What a workspace action's `execute` is handed with its call: the operator
 * context, its parsed `input`, and `entities` that also write the entity
 * types the package owns, as the operator and held to the action policy.
 */
export interface WorkspaceActionContext<
  TConfig,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  TOwned extends AnyEntityDefinition,
  TInput,
> extends OperatorBaseContext<TConfig, TState, TAccountSettings> {
  readonly entities: EntityReader & OwnedEntityWriter<TOwned>;
  readonly input: TInput;
}

export interface WorkspaceActionDefinition<
  TName extends string = string,
  TInputSchema extends OperatorSchema = OperatorSchema,
  TOutputSchema extends OperatorSchema = OperatorSchema,
> {
  readonly kind: "rizom-workspace-action";
  readonly name: TName;
  readonly label: string;
  readonly confirmation?: WorkspaceActionConfirmation | undefined;
  readonly catalog?: true | undefined;
  readonly input: TInputSchema;
  readonly output: TOutputSchema;
  readonly permission?: UserPermissionLevel | undefined;
  bind<
    TConfig,
    TState extends object,
    TAccountSettings extends AnyAccountSettingsDefinition | undefined,
    TOwned extends AnyEntityDefinition = never,
  >(
    context: OperatorBindingContext<TConfig, TState, TAccountSettings, TOwned>,
    execute: (
      context: WorkspaceActionContext<
        TConfig,
        TState,
        TAccountSettings,
        TOwned,
        z.output<TInputSchema>
      >,
    ) => z.input<TOutputSchema> | Promise<z.input<TOutputSchema>>,
    prepare?: (
      context: OperatorBaseContext<TConfig, TState, TAccountSettings> & {
        readonly input: z.output<TInputSchema>;
      },
    ) => WorkspacePreparedConfirmation | Promise<WorkspacePreparedConfirmation>,
  ): BoundWorkspaceAction<
    WorkspaceActionDefinition<TName, TInputSchema, TOutputSchema>,
    TConfig,
    TState,
    TAccountSettings,
    TOwned
  >;
}

export type AnyWorkspaceActionDefinition = WorkspaceActionDefinition<
  string,
  OperatorSchema,
  OperatorSchema
>;

export type WorkspaceActionInput<
  TDefinition extends AnyWorkspaceActionDefinition,
> = z.input<TDefinition["input"]>;

const workspaceActionExecutor: unique symbol = Symbol(
  "rizom.workspace-action-executor",
);

interface WorkspaceActionExecutor<
  TDefinition extends AnyWorkspaceActionDefinition,
  TConfig,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  TOwned extends AnyEntityDefinition,
> {
  readonly execute: (
    context: WorkspaceActionContext<
      TConfig,
      TState,
      TAccountSettings,
      TOwned,
      z.output<TDefinition["input"]>
    >,
  ) => z.input<TDefinition["output"]> | Promise<z.input<TDefinition["output"]>>;
  readonly prepare?:
    | ((
        context: OperatorBaseContext<TConfig, TState, TAccountSettings> & {
          readonly input: z.output<TDefinition["input"]>;
        },
      ) =>
        WorkspacePreparedConfirmation | Promise<WorkspacePreparedConfirmation>)
    | undefined;
}

export interface WorkspaceActionBinding<
  TDefinition extends AnyWorkspaceActionDefinition =
    AnyWorkspaceActionDefinition,
  TConfig = unknown,
  TState extends object = object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined =
    AnyAccountSettingsDefinition | undefined,
  TOwned extends AnyEntityDefinition = never,
> {
  readonly kind: "rizom-workspace-action-binding";
  readonly definition: TDefinition;
  readonly [workspaceActionExecutor]?:
    | WorkspaceActionExecutor<
        TDefinition,
        TConfig,
        TState,
        TAccountSettings,
        TOwned
      >
    | undefined;
}

export type BoundWorkspaceAction<
  TDefinition extends AnyWorkspaceActionDefinition =
    AnyWorkspaceActionDefinition,
  TConfig = unknown,
  TState extends object = object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined =
    AnyAccountSettingsDefinition | undefined,
  TOwned extends AnyEntityDefinition = never,
> = WorkspaceActionBinding<
  TDefinition,
  TConfig,
  TState,
  TAccountSettings,
  TOwned
> &
  OperatorBindingBrand<TConfig, TState, TAccountSettings>;

export function getWorkspaceActionExecutor<
  TDefinition extends AnyWorkspaceActionDefinition,
  TConfig,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  TOwned extends AnyEntityDefinition,
>(
  binding: BoundWorkspaceAction<
    TDefinition,
    TConfig,
    TState,
    TAccountSettings,
    TOwned
  >,
): WorkspaceActionExecutor<
  TDefinition,
  TConfig,
  TState,
  TAccountSettings,
  TOwned
> {
  const executor = binding[workspaceActionExecutor];
  if (!executor) {
    throw new Error(
      `Workspace action "${binding.definition.name}" was not bound by defineWorkspaceAction().bind()`,
    );
  }
  return executor;
}

export function defineWorkspaceAction<
  const TName extends string,
  TInputSchema extends OperatorSchema,
  TOutputSchema extends OperatorSchema,
>(definition: {
  readonly name: TName;
  readonly label: string;
  readonly confirmation?: WorkspaceActionConfirmation | undefined;
  readonly catalog?: true | undefined;
  readonly input: TInputSchema;
  readonly output: TOutputSchema;
  readonly permission?: UserPermissionLevel | undefined;
}): WorkspaceActionDefinition<TName, TInputSchema, TOutputSchema> {
  assertIdentifier(definition.name, "Workspace action name");
  assertText(definition.label, `Workspace action "${definition.name}" label`);
  if (definition.confirmation?.kind === "static") {
    assertText(
      definition.confirmation.message,
      `Workspace action "${definition.name}" confirmation`,
    );
  }
  if (definition.permission !== undefined) {
    assertPermission(
      definition.permission,
      `Workspace action "${definition.name}"`,
    );
  }

  const action: WorkspaceActionDefinition<TName, TInputSchema, TOutputSchema> =
    {
      kind: "rizom-workspace-action",
      ...definition,
      bind(_context, execute, prepare) {
        if (action.confirmation?.kind === "prepared" && !prepare) {
          throw new Error(
            `Workspace action "${action.name}" requires a prepared confirmation callback`,
          );
        }
        return Object.freeze({
          kind: "rizom-workspace-action-binding",
          definition: action,
          [workspaceActionExecutor]: Object.freeze({
            execute,
            ...(prepare ? { prepare } : {}),
          }),
        });
      },
    };
  return Object.freeze(action);
}
