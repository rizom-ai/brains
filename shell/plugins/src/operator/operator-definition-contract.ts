import type { UserPermissionLevel } from "@brains/templates";
import type { z } from "@brains/utils/zod";
import type { AnyEntityDefinition } from "../entity/entity-definition-contract";
import { assertIdentifier } from "../package-definition";
import type { AnyAccountSettingsDefinition } from "./account-settings-definition-contract";
import {
  assertOptionalText,
  assertPermission,
  assertPriority,
  assertText,
  meetsPermission,
} from "./contract-assertions";
import type {
  OperatorBaseContext,
  OperatorBindingBrand,
  OperatorBindingContext,
  OperatorQueryReader,
  OperatorSchema,
} from "./operator-context-contract";
import type {
  StudioWorkspaceView,
  DashboardDigest,
  DashboardOperatorView,
  OperatorEntityCatalogDefinition,
} from "./operator-view-contract";
import type {
  AnyWorkspaceActionDefinition,
  BoundWorkspaceAction,
} from "./workspace-action-definition-contract";

export interface DashboardWidgetDefinition<
  TId extends string = string,
  TDataSchema extends OperatorSchema = OperatorSchema,
> {
  readonly kind: "rizom-dashboard-widget";
  readonly id: TId;
  readonly title: string;
  readonly description?: string | undefined;
  readonly group: string;
  readonly placement: "primary" | "secondary" | "sidebar";
  readonly priority?: number | undefined;
  readonly permission: UserPermissionLevel;
  readonly data: TDataSchema;
  readonly digest?:
    | ((context: { readonly data: z.output<TDataSchema> }) => DashboardDigest)
    | undefined;
  view(context: {
    readonly data: z.output<TDataSchema>;
  }): DashboardOperatorView;
  bind<
    TConfig,
    TState extends object,
    TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  >(
    context: OperatorBindingContext<TConfig, TState, TAccountSettings>,
    load: (
      context: OperatorBaseContext<TConfig, TState, TAccountSettings>,
    ) => z.input<TDataSchema> | Promise<z.input<TDataSchema>>,
  ): BoundDashboardWidget<
    DashboardWidgetDefinition<TId, TDataSchema>,
    TConfig,
    TState,
    TAccountSettings
  >;
}

export type AnyDashboardWidgetDefinition = DashboardWidgetDefinition<
  string,
  OperatorSchema
>;

export interface DashboardWidgetBinding<
  TDefinition extends AnyDashboardWidgetDefinition =
    AnyDashboardWidgetDefinition,
> {
  readonly kind: "rizom-dashboard-widget-binding";
  readonly definition: TDefinition;
}

export type BoundDashboardWidget<
  TDefinition extends AnyDashboardWidgetDefinition =
    AnyDashboardWidgetDefinition,
  TConfig = unknown,
  TState extends object = object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined =
    AnyAccountSettingsDefinition | undefined,
> = DashboardWidgetBinding<TDefinition> &
  OperatorBindingBrand<TConfig, TState, TAccountSettings>;

const dashboardWidgetLoaders = new WeakMap<
  object,
  (
    context: OperatorBaseContext<unknown, object, undefined>,
  ) => unknown | Promise<unknown>
>();

export function getDashboardWidgetLoader<
  TDefinition extends AnyDashboardWidgetDefinition,
  TConfig,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
>(
  binding: BoundDashboardWidget<TDefinition, TConfig, TState, TAccountSettings>,
): (
  context: OperatorBaseContext<TConfig, TState, TAccountSettings>,
) => z.input<TDefinition["data"]> | Promise<z.input<TDefinition["data"]>> {
  const loader = dashboardWidgetLoaders.get(binding);
  if (!loader) {
    throw new Error(
      `Dashboard widget "${binding.definition.id}" was not bound by defineDashboardWidget().bind()`,
    );
  }
  return loader as (
    context: OperatorBaseContext<TConfig, TState, TAccountSettings>,
  ) => z.input<TDefinition["data"]> | Promise<z.input<TDefinition["data"]>>;
}

export function defineDashboardWidget<
  const TId extends string,
  TDataSchema extends OperatorSchema,
>(
  definition: Omit<
    DashboardWidgetDefinition<TId, TDataSchema>,
    "kind" | "bind"
  >,
): DashboardWidgetDefinition<TId, TDataSchema> {
  assertIdentifier(definition.id, "Dashboard widget id");
  assertText(definition.title, `Dashboard widget "${definition.id}" title`);
  assertText(definition.group, `Dashboard widget "${definition.id}" group`);
  assertOptionalText(
    definition.description,
    `Dashboard widget "${definition.id}" description`,
  );
  assertPriority(definition.priority, `Dashboard widget "${definition.id}"`);
  assertPermission(
    definition.permission,
    `Dashboard widget "${definition.id}"`,
  );
  if (!["primary", "secondary", "sidebar"].includes(definition.placement)) {
    throw new Error(
      `Dashboard widget "${definition.id}" placement "${String(definition.placement)}" is unsupported`,
    );
  }

  const widget: DashboardWidgetDefinition<TId, TDataSchema> = {
    kind: "rizom-dashboard-widget",
    ...definition,
    bind(_context, load) {
      const binding = Object.freeze({
        kind: "rizom-dashboard-widget-binding" as const,
        definition: widget,
      });
      dashboardWidgetLoaders.set(
        binding,
        load as (
          context: OperatorBaseContext<unknown, object, undefined>,
        ) => unknown | Promise<unknown>,
      );
      return binding;
    },
  };
  return Object.freeze(widget);
}

export interface StudioWorkspaceDefinition<
  TId extends string = string,
  TDataSchema extends OperatorSchema = OperatorSchema,
  TActions extends readonly AnyWorkspaceActionDefinition[] =
    readonly AnyWorkspaceActionDefinition[],
> {
  readonly kind: "rizom-studio-workspace";
  readonly id: TId;
  readonly label: string;
  readonly description?: string | undefined;
  readonly priority?: number | undefined;
  readonly permission: UserPermissionLevel;
  readonly entities?: readonly AnyEntityDefinition[] | undefined;
  readonly entityCatalog?: OperatorEntityCatalogDefinition | undefined;
  readonly query?: OperatorSchema | undefined;
  readonly data: TDataSchema;
  readonly actions: TActions;
  readonly badge?:
    ((context: { readonly data: z.output<TDataSchema> }) => number) | undefined;
  readonly refresh?:
    | ((context: {
        readonly data: z.output<TDataSchema>;
      }) => number | undefined)
    | undefined;
  view(context: {
    readonly data: z.output<TDataSchema>;
  }): StudioWorkspaceView<TActions[number]>;
  bind<
    TConfig,
    TState extends object,
    TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  >(
    context: OperatorBindingContext<TConfig, TState, TAccountSettings>,
    input: {
      readonly authorize?:
        | ((
            context: OperatorBaseContext<TConfig, TState, TAccountSettings> & {
              readonly query: OperatorQueryReader;
            },
          ) => boolean | Promise<boolean>)
        | undefined;
      readonly load: (
        context: OperatorBaseContext<TConfig, TState, TAccountSettings> & {
          readonly query: OperatorQueryReader;
        },
      ) => z.input<TDataSchema> | Promise<z.input<TDataSchema>>;
      readonly listEntityTypes?:
        | ((
            context: OperatorBaseContext<TConfig, TState, TAccountSettings> & {
              readonly query: OperatorQueryReader;
            },
          ) => readonly string[] | Promise<readonly string[]>)
        | undefined;
      readonly actions: readonly BoundWorkspaceAction<
        TActions[number],
        TConfig,
        TState,
        TAccountSettings
      >[];
    },
  ): BoundStudioWorkspace<
    StudioWorkspaceDefinition<TId, TDataSchema, TActions>,
    TConfig,
    TState,
    TAccountSettings
  >;
}

export type AnyStudioWorkspaceDefinition = StudioWorkspaceDefinition<
  string,
  OperatorSchema,
  readonly AnyWorkspaceActionDefinition[]
>;

const studioWorkspaceExecutor: unique symbol = Symbol(
  "rizom.studio-workspace-executor",
);

interface StudioWorkspaceExecutor<
  TDefinition extends AnyStudioWorkspaceDefinition,
  TConfig,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> {
  readonly authorize?:
    | ((
        context: OperatorBaseContext<TConfig, TState, TAccountSettings> & {
          readonly query: OperatorQueryReader;
        },
      ) => boolean | Promise<boolean>)
    | undefined;
  readonly load: (
    context: OperatorBaseContext<TConfig, TState, TAccountSettings> & {
      readonly query: OperatorQueryReader;
    },
  ) => z.input<TDefinition["data"]> | Promise<z.input<TDefinition["data"]>>;
  readonly listEntityTypes?:
    | ((
        context: OperatorBaseContext<TConfig, TState, TAccountSettings> & {
          readonly query: OperatorQueryReader;
        },
      ) => readonly string[] | Promise<readonly string[]>)
    | undefined;
}

export interface StudioWorkspaceBinding<
  TDefinition extends AnyStudioWorkspaceDefinition =
    AnyStudioWorkspaceDefinition,
  TConfig = unknown,
  TState extends object = object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined =
    AnyAccountSettingsDefinition | undefined,
> {
  readonly kind: "rizom-studio-workspace-binding";
  readonly definition: TDefinition;
  readonly actions: readonly BoundWorkspaceAction<
    TDefinition["actions"][number],
    TConfig,
    TState,
    TAccountSettings
  >[];
  readonly [studioWorkspaceExecutor]?:
    | StudioWorkspaceExecutor<TDefinition, TConfig, TState, TAccountSettings>
    | undefined;
}

export type BoundStudioWorkspace<
  TDefinition extends AnyStudioWorkspaceDefinition =
    AnyStudioWorkspaceDefinition,
  TConfig = unknown,
  TState extends object = object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined =
    AnyAccountSettingsDefinition | undefined,
> = StudioWorkspaceBinding<TDefinition, TConfig, TState, TAccountSettings> &
  OperatorBindingBrand<TConfig, TState, TAccountSettings>;

export function getStudioWorkspaceExecutor<
  TDefinition extends AnyStudioWorkspaceDefinition,
  TConfig,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
>(
  binding: BoundStudioWorkspace<TDefinition, TConfig, TState, TAccountSettings>,
): StudioWorkspaceExecutor<TDefinition, TConfig, TState, TAccountSettings> {
  const executor = binding[studioWorkspaceExecutor];
  if (!executor) {
    throw new Error(
      `Studio workspace "${binding.definition.id}" was not bound by defineStudioWorkspace().bind()`,
    );
  }
  return executor;
}

export function defineStudioWorkspace<
  const TId extends string,
  TDataSchema extends OperatorSchema,
  const TActions extends readonly AnyWorkspaceActionDefinition[],
>(
  definition: Omit<
    StudioWorkspaceDefinition<TId, TDataSchema, TActions>,
    "kind" | "bind"
  >,
): StudioWorkspaceDefinition<TId, TDataSchema, TActions> {
  assertIdentifier(definition.id, "Studio workspace id");
  assertText(definition.label, `Studio workspace "${definition.id}" label`);
  assertOptionalText(
    definition.description,
    `Studio workspace "${definition.id}" description`,
  );
  assertPriority(definition.priority, `Studio workspace "${definition.id}"`);
  assertPermission(
    definition.permission,
    `Studio workspace "${definition.id}"`,
  );
  const actionNames = new Set<string>();
  for (const action of definition.actions) {
    if (actionNames.has(action.name)) {
      throw new Error(
        `Studio workspace "${definition.id}" declares action "${action.name}" more than once`,
      );
    }
    actionNames.add(action.name);
    if (
      action.permission !== undefined &&
      !meetsPermission(action.permission, definition.permission)
    ) {
      throw new Error(
        `Studio workspace "${definition.id}" action "${action.name}" permission cannot be lower than the workspace permission`,
      );
    }
  }

  const workspace: StudioWorkspaceDefinition<TId, TDataSchema, TActions> = {
    kind: "rizom-studio-workspace",
    ...definition,
    ...(definition.entities
      ? { entities: Object.freeze([...definition.entities]) }
      : {}),
    actions: Object.freeze([...definition.actions]) as TActions,
    bind(_context, input) {
      if (
        (workspace.entityCatalog !== undefined) !==
        (input.listEntityTypes !== undefined)
      ) {
        throw new Error(
          `Studio workspace "${workspace.id}" must bind one entity-type catalog callback exactly when it declares entityCatalog`,
        );
      }
      const boundActions = new Set<AnyWorkspaceActionDefinition>();
      for (const action of input.actions) {
        if (!workspace.actions.includes(action.definition)) {
          throw new Error(
            `Studio workspace "${workspace.id}" cannot bind undeclared action "${action.definition.name}"`,
          );
        }
        if (boundActions.has(action.definition)) {
          throw new Error(
            `Studio workspace "${workspace.id}" binds action "${action.definition.name}" more than once`,
          );
        }
        boundActions.add(action.definition);
      }
      for (const action of workspace.actions) {
        if (!boundActions.has(action)) {
          throw new Error(
            `Studio workspace "${workspace.id}" has no executor for action "${action.name}"`,
          );
        }
      }

      return Object.freeze({
        kind: "rizom-studio-workspace-binding",
        definition: workspace,
        actions: Object.freeze([...input.actions]),
        [studioWorkspaceExecutor]: Object.freeze({
          ...(input.authorize ? { authorize: input.authorize } : {}),
          load: input.load,
          ...(input.listEntityTypes
            ? { listEntityTypes: input.listEntityTypes }
            : {}),
        }),
      });
    },
  };
  return Object.freeze(workspace);
}
