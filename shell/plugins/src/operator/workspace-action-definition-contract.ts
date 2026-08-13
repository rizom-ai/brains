import type { UserPermissionLevel } from "@brains/templates";
import type { z } from "@brains/utils/zod";
import { assertIdentifier } from "../package-definition";
import type { AnyAccountSettingsDefinition } from "./account-settings-definition-contract";
import type {
  OperatorBaseContext,
  OperatorBindingBrand,
  OperatorBindingContext,
  OperatorSchema,
} from "./operator-context-contract";

export interface WorkspaceActionDefinition<
  TName extends string = string,
  TInputSchema extends OperatorSchema = OperatorSchema,
  TOutputSchema extends OperatorSchema = OperatorSchema,
> {
  readonly kind: "rizom-workspace-action";
  readonly name: TName;
  readonly label: string;
  readonly confirmation?: string | undefined;
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

export interface WorkspaceActionBinding<
  TDefinition extends AnyWorkspaceActionDefinition =
    AnyWorkspaceActionDefinition,
> {
  readonly kind: "rizom-workspace-action-binding";
  readonly definition: TDefinition;
}

export type BoundWorkspaceAction<
  TDefinition extends AnyWorkspaceActionDefinition =
    AnyWorkspaceActionDefinition,
  TConfig = unknown,
  TState extends object = object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined =
    AnyAccountSettingsDefinition | undefined,
> = WorkspaceActionBinding<TDefinition> &
  OperatorBindingBrand<TConfig, TState, TAccountSettings>;

const workspaceActionExecutors = new WeakMap<
  object,
  (
    context: OperatorBaseContext<unknown, object, undefined> & {
      readonly input: unknown;
    },
  ) => unknown | Promise<unknown>
>();

export function getWorkspaceActionExecutor<
  TDefinition extends AnyWorkspaceActionDefinition,
  TConfig,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
>(
  binding: BoundWorkspaceAction<TDefinition, TConfig, TState, TAccountSettings>,
): (
  context: OperatorBaseContext<TConfig, TState, TAccountSettings> & {
    readonly input: z.output<TDefinition["input"]>;
  },
) => z.input<TDefinition["output"]> | Promise<z.input<TDefinition["output"]>> {
  const executor = workspaceActionExecutors.get(binding);
  if (!executor) {
    throw new Error(
      `Workspace action "${binding.definition.name}" was not bound by defineWorkspaceAction().bind()`,
    );
  }
  return executor as (
    context: OperatorBaseContext<TConfig, TState, TAccountSettings> & {
      readonly input: z.output<TDefinition["input"]>;
    },
  ) => z.input<TDefinition["output"]> | Promise<z.input<TDefinition["output"]>>;
}

export function defineWorkspaceAction<
  const TName extends string,
  TInputSchema extends OperatorSchema,
  TOutputSchema extends OperatorSchema,
>(definition: {
  readonly name: TName;
  readonly label: string;
  readonly confirmation?: string | undefined;
  readonly input: TInputSchema;
  readonly output: TOutputSchema;
  readonly permission?: UserPermissionLevel | undefined;
}): WorkspaceActionDefinition<TName, TInputSchema, TOutputSchema> {
  assertIdentifier(definition.name, "Workspace action name");
  assertText(definition.label, `Workspace action "${definition.name}" label`);
  if (definition.confirmation !== undefined) {
    assertText(
      definition.confirmation,
      `Workspace action "${definition.name}" confirmation`,
    );
  }
  if (
    definition.permission !== undefined &&
    !["public", "trusted", "admin"].includes(definition.permission)
  ) {
    throw new Error(
      `Workspace action "${definition.name}" permission "${String(definition.permission)}" is unsupported`,
    );
  }

  const action: WorkspaceActionDefinition<TName, TInputSchema, TOutputSchema> =
    {
      kind: "rizom-workspace-action",
      ...definition,
      bind(_context, execute) {
        const binding = Object.freeze({
          kind: "rizom-workspace-action-binding" as const,
          definition: action,
        });
        workspaceActionExecutors.set(
          binding,
          execute as (
            context: OperatorBaseContext<unknown, object, undefined> & {
              readonly input: unknown;
            },
          ) => unknown | Promise<unknown>,
        );
        return binding;
      },
    };
  return Object.freeze(action);
}

function assertText(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must not be empty`);
}
