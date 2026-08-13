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
  OperatorSchema,
} from "./operator-context-contract";
import type { DashboardDigest, OperatorView } from "./operator-view-contract";
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
  view(context: { readonly data: z.output<TDataSchema> }): OperatorView<never>;
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

export interface CmsWorkspaceDefinition<
  TId extends string = string,
  TDataSchema extends OperatorSchema = OperatorSchema,
  TActions extends readonly AnyWorkspaceActionDefinition[] =
    readonly AnyWorkspaceActionDefinition[],
> {
  readonly kind: "rizom-cms-workspace";
  readonly id: TId;
  readonly label: string;
  readonly description?: string | undefined;
  readonly priority?: number | undefined;
  readonly permission: UserPermissionLevel;
  readonly entities?: readonly AnyEntityDefinition[] | undefined;
  readonly data: TDataSchema;
  readonly actions: TActions;
  readonly badge?:
    ((context: { readonly data: z.output<TDataSchema> }) => number) | undefined;
  view(context: {
    readonly data: z.output<TDataSchema>;
  }): OperatorView<TActions[number]>;
  bind<
    TConfig,
    TState extends object,
    TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  >(
    context: OperatorBindingContext<TConfig, TState, TAccountSettings>,
    input: {
      readonly authorize?:
        | ((
            context: OperatorBaseContext<TConfig, TState, TAccountSettings>,
          ) => boolean | Promise<boolean>)
        | undefined;
      readonly load: (
        context: OperatorBaseContext<TConfig, TState, TAccountSettings>,
      ) => z.input<TDataSchema> | Promise<z.input<TDataSchema>>;
      readonly actions: readonly BoundWorkspaceAction<
        TActions[number],
        TConfig,
        TState,
        TAccountSettings
      >[];
    },
  ): BoundCmsWorkspace<
    CmsWorkspaceDefinition<TId, TDataSchema, TActions>,
    TConfig,
    TState,
    TAccountSettings
  >;
}

export type AnyCmsWorkspaceDefinition = CmsWorkspaceDefinition<
  string,
  OperatorSchema,
  readonly AnyWorkspaceActionDefinition[]
>;

export interface CmsWorkspaceBinding<
  TDefinition extends AnyCmsWorkspaceDefinition = AnyCmsWorkspaceDefinition,
  TConfig = unknown,
  TState extends object = object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined =
    AnyAccountSettingsDefinition | undefined,
> {
  readonly kind: "rizom-cms-workspace-binding";
  readonly definition: TDefinition;
  readonly actions: readonly BoundWorkspaceAction<
    TDefinition["actions"][number],
    TConfig,
    TState,
    TAccountSettings
  >[];
}

export type BoundCmsWorkspace<
  TDefinition extends AnyCmsWorkspaceDefinition = AnyCmsWorkspaceDefinition,
  TConfig = unknown,
  TState extends object = object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined =
    AnyAccountSettingsDefinition | undefined,
> = CmsWorkspaceBinding<TDefinition, TConfig, TState, TAccountSettings> &
  OperatorBindingBrand<TConfig, TState, TAccountSettings>;

interface CmsWorkspaceExecutor {
  readonly authorize?:
    | ((
        context: OperatorBaseContext<unknown, object, undefined>,
      ) => boolean | Promise<boolean>)
    | undefined;
  readonly load: (
    context: OperatorBaseContext<unknown, object, undefined>,
  ) => unknown | Promise<unknown>;
}

const cmsWorkspaceExecutors = new WeakMap<object, CmsWorkspaceExecutor>();

export function getCmsWorkspaceExecutor<
  TDefinition extends AnyCmsWorkspaceDefinition,
  TConfig,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
>(
  binding: BoundCmsWorkspace<TDefinition, TConfig, TState, TAccountSettings>,
): {
  readonly authorize?:
    | ((
        context: OperatorBaseContext<TConfig, TState, TAccountSettings>,
      ) => boolean | Promise<boolean>)
    | undefined;
  readonly load: (
    context: OperatorBaseContext<TConfig, TState, TAccountSettings>,
  ) => z.input<TDefinition["data"]> | Promise<z.input<TDefinition["data"]>>;
} {
  const executor = cmsWorkspaceExecutors.get(binding);
  if (!executor) {
    throw new Error(
      `CMS workspace "${binding.definition.id}" was not bound by defineCmsWorkspace().bind()`,
    );
  }
  return executor as {
    readonly authorize?:
      | ((
          context: OperatorBaseContext<TConfig, TState, TAccountSettings>,
        ) => boolean | Promise<boolean>)
      | undefined;
    readonly load: (
      context: OperatorBaseContext<TConfig, TState, TAccountSettings>,
    ) => z.input<TDefinition["data"]> | Promise<z.input<TDefinition["data"]>>;
  };
}

export function defineCmsWorkspace<
  const TId extends string,
  TDataSchema extends OperatorSchema,
  const TActions extends readonly AnyWorkspaceActionDefinition[],
>(
  definition: Omit<
    CmsWorkspaceDefinition<TId, TDataSchema, TActions>,
    "kind" | "bind"
  >,
): CmsWorkspaceDefinition<TId, TDataSchema, TActions> {
  assertIdentifier(definition.id, "CMS workspace id");
  assertText(definition.label, `CMS workspace "${definition.id}" label`);
  assertOptionalText(
    definition.description,
    `CMS workspace "${definition.id}" description`,
  );
  assertPriority(definition.priority, `CMS workspace "${definition.id}"`);
  assertPermission(definition.permission, `CMS workspace "${definition.id}"`);
  const actionNames = new Set<string>();
  for (const action of definition.actions) {
    if (actionNames.has(action.name)) {
      throw new Error(
        `CMS workspace "${definition.id}" declares action "${action.name}" more than once`,
      );
    }
    actionNames.add(action.name);
    if (
      action.permission !== undefined &&
      !meetsPermission(action.permission, definition.permission)
    ) {
      throw new Error(
        `CMS workspace "${definition.id}" action "${action.name}" permission cannot be lower than the workspace permission`,
      );
    }
  }

  const workspace: CmsWorkspaceDefinition<TId, TDataSchema, TActions> = {
    kind: "rizom-cms-workspace",
    ...definition,
    ...(definition.entities
      ? { entities: Object.freeze([...definition.entities]) }
      : {}),
    actions: Object.freeze([...definition.actions]) as TActions,
    bind(_context, input) {
      const boundActions = new Set<AnyWorkspaceActionDefinition>();
      for (const action of input.actions) {
        if (!workspace.actions.includes(action.definition)) {
          throw new Error(
            `CMS workspace "${workspace.id}" cannot bind undeclared action "${action.definition.name}"`,
          );
        }
        if (boundActions.has(action.definition)) {
          throw new Error(
            `CMS workspace "${workspace.id}" binds action "${action.definition.name}" more than once`,
          );
        }
        boundActions.add(action.definition);
      }
      for (const action of workspace.actions) {
        if (!boundActions.has(action)) {
          throw new Error(
            `CMS workspace "${workspace.id}" has no executor for action "${action.name}"`,
          );
        }
      }

      const binding = Object.freeze({
        kind: "rizom-cms-workspace-binding" as const,
        definition: workspace,
        actions: Object.freeze([...input.actions]),
      });
      cmsWorkspaceExecutors.set(binding, {
        authorize: input.authorize as CmsWorkspaceExecutor["authorize"],
        load: input.load as CmsWorkspaceExecutor["load"],
      });
      return binding;
    },
  };
  return Object.freeze(workspace);
}
