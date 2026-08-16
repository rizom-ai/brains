import type { z } from "@brains/utils/zod";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  type DashboardWidgetProviderContext,
  type DashboardWidgetRegistration,
} from "../base/dashboard-namespace";
import type { AnyAccountSettingsDefinition } from "./account-settings-definition-contract";
import type { AccountSettingsRegistration } from "./account-settings-registry";
import { createOperatorContext } from "./operator-context-runtime";
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
  type RuntimeOperatorValidationIssue,
} from "./operator-view-runtime";
import { meetsPermission } from "./contract-assertions";
import type { BasePluginContext } from "../base/context";
import type { OperatorCaller } from "./operator-context-contract";

type DashboardDigestProviderResult = ReturnType<
  NonNullable<DashboardWidgetRegistration["digestProvider"]>
>;

interface RuntimeWidgetIdentity {
  readonly publicServiceId: string;
  readonly packageName: string;
  readonly widgetId: string;
}

function runtimeError(
  identity: RuntimeWidgetIdentity,
  stage: string,
  detail?: string,
): Error {
  return new Error(
    `Service "${identity.publicServiceId}" package "${identity.packageName}" dashboard widget "${identity.widgetId}" ${stage}${detail ? `: ${detail}` : ""}`,
  );
}

function validationDetail(
  issues: readonly RuntimeOperatorValidationIssue[],
): string {
  return issues
    .slice(0, 5)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "value";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function parseWidgetData<TSchema extends z.ZodType<unknown, unknown>>(
  schema: TSchema,
  input: unknown,
  identity: RuntimeWidgetIdentity,
): z.output<TSchema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw runtimeError(
      identity,
      "returned invalid data; return a value matching its data schema",
      validationDetail(parsed.error.issues),
    );
  }
  return parsed.data;
}

function parseWidgetView(
  input: unknown,
  identity: RuntimeWidgetIdentity,
): RuntimeDashboardOperatorView {
  const parsed = safeParseRuntimeDashboardOperatorView(input);
  if (!parsed.success) {
    throw runtimeError(
      identity,
      "returned an invalid view; use supported OperatorView blocks and safe links",
      validationDetail(parsed.issues),
    );
  }
  return parsed.data;
}

function parseWidgetDigest(
  input: unknown,
  identity: RuntimeWidgetIdentity,
): RuntimeDashboardDigest {
  const parsed = safeParseRuntimeDashboardDigest(input);
  if (!parsed.success) {
    throw runtimeError(
      identity,
      "returned an invalid digest; provide at most four bounded lines and a non-negative attention count",
      validationDetail(parsed.issues),
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
}): DashboardWidgetRegistration {
  const definition = input.binding.definition;
  const identity: RuntimeWidgetIdentity = {
    publicServiceId: input.publicServiceId,
    packageName: input.packageName,
    widgetId: definition.id,
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
    async dataProvider(provider): Promise<RuntimeDashboardWidgetData> {
      const runtimeProvider: DashboardWidgetProviderContext = {
        ...provider,
        signal: AbortSignal.any([provider.signal, input.runtimeSignal]),
      };
      const granted = runtimeProvider.caller?.permission ?? "public";
      if (!meetsPermission(granted, definition.permission)) {
        throw runtimeError(
          identity,
          "was requested below its minimum permission",
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
      });
      runtimeProvider.signal.throwIfAborted();

      let rawData: unknown;
      try {
        rawData = await load(runtimeContext);
      } catch (error) {
        if (runtimeProvider.signal.aborted) {
          throw runtimeProvider.signal.reason ?? error;
        }
        throw runtimeError(identity, "data loader failed");
      }
      runtimeProvider.signal.throwIfAborted();
      const data = parseWidgetData(definition.data, rawData, identity);

      let rawView: unknown;
      try {
        rawView = definition.view({ data });
      } catch (error) {
        if (runtimeProvider.signal.aborted) {
          throw runtimeProvider.signal.reason ?? error;
        }
        throw runtimeError(identity, "view derivation failed");
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
          throw runtimeError(identity, "digest derivation failed");
        }
        digest = parseWidgetDigest(rawDigest, identity);
      }

      return Object.freeze({ view, ...(digest ? { digest } : {}) });
    },
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
}

const builtInBindingContext = Object.freeze({
  config: Object.freeze({}),
  state: Object.freeze({}),
  accountSettings: undefined,
});

/**
 * Runs a first-party widget through the same public definition, normalization,
 * permission, and host-rendering path used by external declarative services.
 * The loader is not bound when Dashboard is absent or in an execution worker.
 */
export async function registerBuiltInDashboardWidget<
  TDefinition extends AnyDashboardWidgetDefinition,
>(input: {
  readonly context: BasePluginContext;
  readonly definition: TDefinition;
  readonly load: (provider: {
    readonly caller: OperatorCaller | null;
    readonly signal: AbortSignal;
  }) => z.input<TDefinition["data"]> | Promise<z.input<TDefinition["data"]>>;
  readonly runtimeSignal?: AbortSignal | undefined;
}): Promise<boolean> {
  if (input.context.executionOnly || !input.context.dashboard.isAvailable()) {
    return false;
  }
  const binding = input.definition.bind(
    builtInBindingContext,
    ({ caller, signal }) => input.load({ caller, signal }),
  );
  const registration = createDeclarativeDashboardWidgetRegistration({
    publicServiceId: input.context.pluginId,
    packageName: input.context.pluginId,
    config: builtInBindingContext.config,
    state: builtInBindingContext.state,
    binding,
    context: input.context,
    runtimeSignal: input.runtimeSignal ?? new AbortController().signal,
  });
  return input.context.dashboard.registerWidget(registration);
}
