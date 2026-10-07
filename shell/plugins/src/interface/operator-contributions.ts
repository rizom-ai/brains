import type { z } from "@brains/utils/zod";
import type { BasePluginContext } from "../base/context";
import type { AnyAccountSettingsDefinition } from "../operator/account-settings-definition-contract";
import type { AccountSettingsRegistration } from "../operator/account-settings-registry";
import type { OperatorBindingContext } from "../operator/operator-context-contract";
import type {
  AnyStudioWorkspaceDefinition,
  BoundStudioWorkspace,
} from "../operator/operator-definition-contract";
import { createDeclarativeStudioWorkspaceRegistration } from "../operator/studio-workspace-runtime";
import type { OperationalHealthProvider } from "../operational-health-registry";
import { runCleanups } from "../internal/cleanup";

/** Interfaces describe their own operator surfaces; no registries or entity writes escape. */
export interface InterfaceOperatorContributions<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> {
  readonly studioWorkspaces?: (
    context: OperatorBindingContext<
      z.output<TConfigSchema>,
      TState,
      TAccountSettings | undefined
    >,
  ) => readonly BoundStudioWorkspace<
    AnyStudioWorkspaceDefinition,
    z.output<TConfigSchema>,
    TState,
    TAccountSettings | undefined
  >[];
  readonly health?: (context: {
    readonly config: z.output<TConfigSchema>;
    readonly state: TState;
  }) => Readonly<Record<string, OperationalHealthProvider>>;
}

/** Shared by HTTP and message interfaces; registration is atomic and web-role only. */
export async function registerInterfaceOperatorContributions<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
>(input: {
  readonly definition: InterfaceOperatorContributions<
    TConfigSchema,
    TState,
    TAccountSettings
  >;
  readonly context: BasePluginContext;
  readonly config: z.output<TConfigSchema>;
  readonly state: TState;
  readonly accountSettings: TAccountSettings | undefined;
  readonly accountSettingsRegistration?: AccountSettingsRegistration<
    NonNullable<TAccountSettings>
  >;
  readonly packageName: string;
  readonly pluginId: string;
  readonly signal: AbortSignal;
}): Promise<() => Promise<void>> {
  const cleanups: Array<() => void | Promise<void>> = [];
  const lifetime = new AbortController();
  const signal = AbortSignal.any([input.signal, lifetime.signal]);
  const cleanup = async (): Promise<void> => {
    lifetime.abort();
    await runCleanups(cleanups.splice(0).reverse());
  };
  const { context, definition, config, state } = input;
  if (context.executionOnly) return cleanup;
  try {
    const bindings = context.studio.isAvailable()
      ? (definition.studioWorkspaces?.({
          config,
          state,
          accountSettings: input.accountSettings,
        }) ?? [])
      : [];
    const ids = new Set<string>();
    for (const binding of bindings) {
      if (ids.has(binding.definition.id))
        throw new Error("Duplicate interface Studio workspace");
      ids.add(binding.definition.id);
    }
    for (const binding of bindings) {
      const id = `${input.pluginId}:${binding.definition.id}`;
      const registration = createDeclarativeStudioWorkspaceRegistration({
        publicServiceId: input.pluginId,
        packageName: input.packageName,
        runtimeWorkspaceId: id,
        ...(binding.definition.aliases
          ? {
              aliases: binding.definition.aliases.map((alias) => ({
                id: `${input.pluginId}:${alias.id}`,
                query: alias.query,
              })),
            }
          : {}),
        config,
        state,
        binding,
        context,
        ...(input.accountSettingsRegistration
          ? { accountSettingsRegistration: input.accountSettingsRegistration }
          : {}),
        runtimeSignal: signal,
      });
      const result = await context.studio.registerWorkspace(registration);
      if (result === false) {
        await cleanup();
        break;
      }
      cleanups.push(async () => {
        await context.studio.unregisterWorkspace(id);
      });
    }
    for (const [name, provider] of Object.entries(
      definition.health?.({ config, state }) ?? {},
    )) {
      cleanups.push(context.operationalHealth.register(name, provider));
    }
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}
