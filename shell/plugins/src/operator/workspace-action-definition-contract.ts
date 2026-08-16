import type { UserPermissionLevel } from "@brains/templates";
import type { z } from "@brains/utils/zod";
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
  >(
    context: OperatorBindingContext<TConfig, TState, TAccountSettings>,
    execute: (
      context: OperatorBaseContext<TConfig, TState, TAccountSettings> & {
        readonly input: z.output<TInputSchema>;
      },
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
    TAccountSettings
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
> {
  readonly execute: (
    context: OperatorBaseContext<TConfig, TState, TAccountSettings> & {
      readonly input: z.output<TDefinition["input"]>;
    },
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
> {
  readonly kind: "rizom-workspace-action-binding";
  readonly definition: TDefinition;
  readonly [workspaceActionExecutor]?:
    | WorkspaceActionExecutor<TDefinition, TConfig, TState, TAccountSettings>
    | undefined;
}

export type BoundWorkspaceAction<
  TDefinition extends AnyWorkspaceActionDefinition =
    AnyWorkspaceActionDefinition,
  TConfig = unknown,
  TState extends object = object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined =
    AnyAccountSettingsDefinition | undefined,
> = WorkspaceActionBinding<TDefinition, TConfig, TState, TAccountSettings> &
  OperatorBindingBrand<TConfig, TState, TAccountSettings>;

export function getWorkspaceActionExecutor<
  TDefinition extends AnyWorkspaceActionDefinition,
  TConfig,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
>(
  binding: BoundWorkspaceAction<TDefinition, TConfig, TState, TAccountSettings>,
): WorkspaceActionExecutor<TDefinition, TConfig, TState, TAccountSettings> {
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
