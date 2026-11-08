import type { z } from "@brains/utils/zod";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  type DashboardWidgetProviderContext,
  type DashboardWidgetRegistration,
  type DashboardWidgetRenderer,
} from "../base/dashboard-namespace";
import type {
  AccountSettingsReader,
  AnyAccountSettingsDefinition,
} from "./account-settings-definition-contract";
import type { AccountSettingsRegistration } from "./account-settings-registry";
import {
  callerVisibilityScope,
  createOperatorContext,
  type OperatorRunAs,
} from "./operator-context-runtime";
import type { EntityReader } from "../entity/entity-definition-contract";
import type { ContentVisibility } from "@brains/entity-service";
import {
  getDashboardWidgetLoader,
  type AnyDashboardWidgetDefinition,
  type BoundDashboardWidget,
} from "./operator-definition-contract";
import {
  safeParseRuntimeDashboardDigest,
  safeParseRuntimeDashboardOperatorView,
  safeParseRuntimeDashboardWidgetData,
  type RuntimeDashboardDigest,
  type RuntimeDashboardOperatorView,
  type RuntimeDashboardWidgetData,
} from "./operator-view-runtime";
import {
  callbackFailure,
  parseOperatorData,
  reportedFailure,
  runtimeError,
  validationDetail,
  type OperatorRuntimeIdentity,
} from "./operator-runtime-errors";
import { meetsPermission } from "./contract-assertions";
import type { BasePluginContext } from "../base/context";
import type { OperatorCaller } from "./operator-context-contract";

type DashboardDigestProviderResult = ReturnType<
  NonNullable<DashboardWidgetRegistration["digestProvider"]>
>;

function parseWidgetView(
  input: unknown,
  identity: OperatorRuntimeIdentity,
): RuntimeDashboardOperatorView {
  const parsed = safeParseRuntimeDashboardOperatorView(input);
  if (!parsed.success) {
    throw runtimeError(
      identity,
      "returned an invalid view; use supported OperatorView blocks and safe links",
      validationDetail(parsed.issues),
      { code: "invalid_response" },
    );
  }
  return parsed.data;
}

function parseWidgetDigest(
  input: unknown,
  identity: OperatorRuntimeIdentity,
): RuntimeDashboardDigest {
  const parsed = safeParseRuntimeDashboardDigest(input);
  if (!parsed.success) {
    throw runtimeError(
      identity,
      "returned an invalid digest; provide at most four bounded lines and a non-negative attention count",
      validationDetail(parsed.issues),
      { code: "invalid_response" },
    );
  }
  return parsed.data;
}

export function createDeclarativeDashboardWidgetRegistration<
  TDefinition extends AnyDashboardWidgetDefinition,
  TConfig,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
>(input: {
  readonly publicServiceId: string;
  readonly packageName: string;
  readonly config: TConfig;
  readonly state: TState;
  readonly accountSettingsRegistration?: AccountSettingsRegistration<
    NonNullable<TAccountSettings>
  >;
  readonly binding: BoundDashboardWidget<
    TDefinition,
    TConfig,
    TState,
    TAccountSettings
  >;
  readonly context: BasePluginContext;
  readonly runtimeSignal: AbortSignal;
  /**
   * Built-in widgets that draw themselves also need their own data, not just
   * the derived view. Never set for external services, whose widget payload
   * stays exactly the semantic envelope.
   */
  readonly includeSource?: boolean | undefined;
  /** A service's own `entities`, which act as the current caller. */
  readonly entities?: EntityReader | undefined;
  /** A service's own account settings, read for the current caller. */
  readonly accountSettings?:
    AccountSettingsReader<NonNullable<TAccountSettings>> | undefined;
  /** Runs the loader as its caller, in the declaring package's context. */
  readonly runAs?: OperatorRunAs | undefined;
}): DashboardWidgetRegistration {
  const definition = input.binding.definition;
  const identity: OperatorRuntimeIdentity = {
    publicServiceId: input.publicServiceId,
    packageName: input.packageName,
    surface: "dashboard widget",
    id: definition.id,
  };
  const load = getDashboardWidgetLoader(input.binding);

  return {
    id: definition.id,
    title: definition.title,
    ...(definition.description ? { description: definition.description } : {}),
    group: definition.group,
    rendererName: DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
    section: definition.placement,
    priority: definition.priority ?? 50,
    visibility: definition.permission,
    dataProvider: (provider) =>
      input.runAs
        ? input.runAs(
            { caller: provider.caller, interfaceType: "dashboard" },
            () => reported(provider, () => provideData(provider)),
          )
        : reported(provider, () => provideData(provider)),
    digestProvider(data): DashboardDigestProviderResult {
      const parsed = safeParseRuntimeDashboardWidgetData(data);
      if (!parsed.success) return {};
      return {
        ...(parsed.data.digest
          ? {
              digest: parsed.data.digest.items.map((item) => ({
                ...item,
                tone: item.tone ?? "plain",
              })),
            }
          : {}),
        ...(parsed.data.digest?.attention !== undefined
          ? { needsAttention: parsed.data.digest.attention }
          : {}),
      };
    },
  };

  function reported<T>(
    provider: DashboardWidgetProviderContext,
    run: () => Promise<T>,
  ): Promise<T> {
    return reportedFailure(
      input.context.logger,
      [provider.signal, input.runtimeSignal],
      run,
    );
  }

  async function provideData(
    provider: DashboardWidgetProviderContext,
  ): Promise<RuntimeDashboardWidgetData & { readonly source?: unknown }> {
    const runtimeProvider: DashboardWidgetProviderContext = {
      ...provider,
      signal: AbortSignal.any([provider.signal, input.runtimeSignal]),
    };
    const granted = runtimeProvider.caller?.permission ?? "public";
    if (!meetsPermission(granted, definition.permission)) {
      throw runtimeError(
        identity,
        "was requested below its minimum permission",
        undefined,
        { code: "permission_denied" },
      );
    }
    const runtimeContext = await createOperatorContext({
      config: input.config,
      state: input.state,
      ...(input.accountSettingsRegistration
        ? { accountSettingsRegistration: input.accountSettingsRegistration }
        : {}),
      provider: runtimeProvider,
      context: input.context,
      entities: input.entities,
      accountSettings: input.accountSettings,
    });
    runtimeProvider.signal.throwIfAborted();

    let rawData: unknown;
    try {
      rawData = await load(runtimeContext);
    } catch (error) {
      if (runtimeProvider.signal.aborted) {
        throw runtimeProvider.signal.reason ?? error;
      }
      throw callbackFailure(identity, "data loader failed", error);
    }
    runtimeProvider.signal.throwIfAborted();
    const data = parseOperatorData(definition.data, rawData, identity);

    let rawView: unknown;
    try {
      rawView = definition.view({ data });
    } catch (error) {
      if (runtimeProvider.signal.aborted) {
        throw runtimeProvider.signal.reason ?? error;
      }
      throw callbackFailure(identity, "view derivation failed", error);
    }
    const view = parseWidgetView(rawView, identity);

    let digest: RuntimeDashboardDigest | undefined;
    if (definition.digest) {
      let rawDigest: unknown;
      try {
        rawDigest = definition.digest({ data });
      } catch (error) {
        if (runtimeProvider.signal.aborted) {
          throw runtimeProvider.signal.reason ?? error;
        }
        throw callbackFailure(identity, "digest derivation failed", error);
      }
      digest = parseWidgetDigest(rawDigest, identity);
    }

    return Object.freeze({
      view,
      ...(digest ? { digest } : {}),
      ...(input.includeSource ? { source: data } : {}),
    });
  }
}

const builtInBindingContext = Object.freeze({
  config: Object.freeze({}),
  state: Object.freeze({}),
  accountSettings: undefined,
});

/**
 * Runs a first-party widget through the same public definition, normalization,
 * permission, and host-rendering path used by external declarative services.
 * The loader is not bound when neither Dashboard nor Studio Overview can host
 * it, or in an execution worker.
 *
 * Passing `render` swaps the declarative body for the widget's own component.
 * The definition still derives its view and digest, so the semantic blocks
 * remain the widget's text description and its digest strip stays live.
 */
export async function registerBuiltInDashboardWidget<
  TDefinition extends AnyDashboardWidgetDefinition,
>(input: {
  readonly context: BasePluginContext;
  readonly definition: TDefinition;
  readonly load: (provider: {
    readonly caller: OperatorCaller | null;
    /** What the caller may read: pass it to every entity read. */
    readonly visibilityScope: ContentVisibility;
    readonly signal: AbortSignal;
  }) => z.input<TDefinition["data"]> | Promise<z.input<TDefinition["data"]>>;
  readonly render?: DashboardWidgetRenderer | undefined;
  readonly runtimeSignal?: AbortSignal | undefined;
}): Promise<boolean> {
  if (input.context.executionOnly || !input.context.dashboard.isAvailable()) {
    return false;
  }
  const binding = input.definition.bind(
    builtInBindingContext,
    ({ caller, signal }) =>
      input.load({
        caller,
        visibilityScope: callerVisibilityScope(caller),
        signal,
      }),
  );
  const declarative = createDeclarativeDashboardWidgetRegistration({
    publicServiceId: input.context.pluginId,
    packageName: input.context.pluginId,
    config: builtInBindingContext.config,
    state: builtInBindingContext.state,
    binding,
    context: input.context,
    runtimeSignal: input.runtimeSignal ?? new AbortController().signal,
    includeSource: input.render !== undefined,
  });
  const registration: DashboardWidgetRegistration = input.render
    ? { ...declarative, renderer: input.render }
    : declarative;
  return input.context.dashboard.registerWidget(registration);
}
