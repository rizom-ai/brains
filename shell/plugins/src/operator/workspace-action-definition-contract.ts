import type { UserPermissionLevel } from "@brains/templates";
import { z } from "@brains/utils/zod";
import type {
  AnyEntityDefinition,
  EntityReader,
} from "../entity/entity-definition-contract";
import type { OwnedEntityWriter } from "../entity/owned-entity-writer";
import { assertIdentifier } from "../package-definition";
import type {
  AnyAccountSettingsDefinition,
  ServiceAccountSettings,
} from "./account-settings-definition-contract";
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
  /**
   * Writes the package's own account settings for the operator's account.
   * A `claim()` names their account and the Studio session they act in, so
   * only that session's account can `redeem` it.
   */
  readonly accountSettings: ServiceAccountSettings<
    NonNullable<TAccountSettings>
  >;
  readonly input: TInput;
}

/**
 * Where a launch may send the browser: absolute `https` origins, declared
 * with the action so a destination the action computes is checked against
 * them before the browser moves.
 */
export interface WorkspaceActionLaunch {
  readonly origins: readonly string[];
}

/** What a launch action answers: the URL to send the browser to. */
export type WorkspaceLaunchOutputSchema = z.ZodObject<
  { url: z.ZodString },
  z.core.$strip
>;

const workspaceLaunchOutputSchema: WorkspaceLaunchOutputSchema = z.object({
  url: z.string(),
});

const MAX_LAUNCH_URL_LENGTH = 2_048;

/** An origin a launch may declare: absolute `https`, with nothing past the host. */
function isHttpsOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "https:" && parsed.origin === origin;
  } catch {
    // An origin that does not parse is not one to send a browser to.
    return false;
  }
}

function assertLaunchOrigin(origin: string, action: string): void {
  if (!isHttpsOrigin(origin)) {
    throw new Error(
      `Workspace action "${action}" launch origin "${origin}" must be an absolute https origin, such as https://example.com`,
    );
  }
}

/**
 * Whether a launch may send the browser to `url`: an absolute `https` URL on
 * a declared origin, carrying no credentials, within 2048 characters.
 */
export function isLaunchDestination(
  launch: WorkspaceActionLaunch,
  url: string,
): boolean {
  if (url.length > MAX_LAUNCH_URL_LENGTH) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      launch.origins.includes(parsed.origin)
    );
  } catch {
    // A destination that does not parse is not one to send a browser to.
    return false;
  }
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
  /**
   * Set on an action that sends the operator's browser to a URL it computes,
   * such as a provider's consent page. Its `execute` answers `{ url }`.
   */
  readonly launch?: WorkspaceActionLaunch | undefined;
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

interface WorkspaceActionDeclaration<
  TName extends string,
  TInputSchema extends OperatorSchema,
> {
  readonly name: TName;
  readonly label: string;
  readonly confirmation?: WorkspaceActionConfirmation | undefined;
  readonly catalog?: true | undefined;
  readonly input: TInputSchema;
  readonly permission?: UserPermissionLevel | undefined;
}

/** An action whose `execute` answers with its `output` schema. */
export function defineWorkspaceAction<
  const TName extends string,
  TInputSchema extends OperatorSchema,
  TOutputSchema extends OperatorSchema,
>(
  definition: WorkspaceActionDeclaration<TName, TInputSchema> & {
    readonly output: TOutputSchema;
    readonly launch?: undefined;
  },
): WorkspaceActionDefinition<TName, TInputSchema, TOutputSchema>;
/**
 * An action that sends the operator's browser to a URL it computes: its
 * `execute` answers `{ url }`, which the runtime checks against the declared
 * origins before the browser moves.
 */
export function defineWorkspaceAction<
  const TName extends string,
  TInputSchema extends OperatorSchema,
>(
  definition: WorkspaceActionDeclaration<TName, TInputSchema> & {
    readonly launch: WorkspaceActionLaunch;
    readonly output?: undefined;
  },
): WorkspaceActionDefinition<TName, TInputSchema, WorkspaceLaunchOutputSchema>;
export function defineWorkspaceAction<
  const TName extends string,
  TInputSchema extends OperatorSchema,
>(
  definition: WorkspaceActionDeclaration<TName, TInputSchema> & {
    readonly output?: OperatorSchema | undefined;
    readonly launch?: WorkspaceActionLaunch | undefined;
  },
): WorkspaceActionDefinition<TName, TInputSchema, OperatorSchema> {
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
  const { launch, output, ...declared } = definition;
  if (launch) {
    if (output !== undefined) {
      throw new Error(
        `Workspace action "${definition.name}" launches the browser, so it declares no output`,
      );
    }
    if (launch.origins.length === 0 || launch.origins.length > 10) {
      throw new Error(
        `Workspace action "${definition.name}" launch declares one to ten origins`,
      );
    }
    for (const origin of launch.origins) {
      assertLaunchOrigin(origin, definition.name);
    }
  } else if (output === undefined) {
    throw new Error(
      `Workspace action "${definition.name}" declares an output schema`,
    );
  }

  const action: WorkspaceActionDefinition<TName, TInputSchema, OperatorSchema> =
    {
      kind: "rizom-workspace-action",
      ...declared,
      output: output ?? workspaceLaunchOutputSchema,
      ...(launch && {
        launch: Object.freeze({ origins: Object.freeze([...launch.origins]) }),
      }),
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
