import { permissionToVisibilityScope } from "@brains/entity-service";
import type { JobInfo } from "@brains/job-queue";
import type { z } from "@brains/utils/zod";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  type DashboardWidgetProviderContext,
  type DashboardWidgetRegistration,
} from "../base/dashboard-namespace";
import { parseDefinitionEntity } from "../entity/declarative-entity-plugin";
import type {
  AnyEntityDefinition,
  EntityOf,
} from "../entity/entity-definition-contract";
import type {
  AccountSettingsValue,
  AnyAccountSettingsDefinition,
  RedactedAccountSettingsValue,
} from "./account-settings-definition-contract";
import type { AccountSettingsRegistration } from "./account-settings-registry";
import type {
  OperatorBaseContext,
  OperatorJobDefinition,
  OperatorJobReference,
  OperatorJobs,
  OperatorJobStatus,
} from "./operator-context-contract";
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
import type { ServicePluginContext } from "../service/context";
import { getServiceJobRuntimeType } from "../service/job-definition-runtime";

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

function redactSettings<TDefinition extends AnyAccountSettingsDefinition>(
  definition: TDefinition,
  settings: AccountSettingsValue<TDefinition>,
): RedactedAccountSettingsValue<TDefinition> {
  const redacted = { ...settings };
  for (const name in redacted) {
    if (definition.fields[name]?.secret === true) delete redacted[name];
  }
  return Object.freeze(redacted);
}

function parseOperatorJobOutput<TSchema extends z.ZodType<unknown, unknown>>(
  schema: TSchema,
  input: unknown,
): z.output<TSchema> {
  return schema.parse(input);
}

function operatorJobStatus<TDefinition extends OperatorJobDefinition>(
  definition: TDefinition,
  job: JobInfo,
): OperatorJobStatus<z.output<TDefinition["output"]>> {
  const result: z.output<TDefinition["output"]> | undefined =
    job.status === "completed" && job.result !== undefined
      ? parseOperatorJobOutput<TDefinition["output"]>(
          definition.output,
          job.result,
        )
      : undefined;
  return Object.freeze({
    id: job.id,
    status: job.status,
    ...(result !== undefined ? { result } : {}),
    ...(job.lastError ? { error: job.lastError } : {}),
  });
}

function createOperatorJobs(context: ServicePluginContext): OperatorJobs {
  return {
    async enqueue<TDefinition extends OperatorJobDefinition>(
      definition: TDefinition,
      input: z.input<TDefinition["input"]>,
    ): Promise<OperatorJobReference<TDefinition>> {
      const runtimeType = getServiceJobRuntimeType(definition);
      const id = await context.jobs.enqueue({
        type: runtimeType,
        data: definition.input.parse(input),
        options: {
          source: context.pluginId,
          metadata: {
            operationType: "data_processing",
            pluginId: context.pluginId,
          },
        },
      });
      return Object.freeze({
        id,
        status: async (): Promise<OperatorJobStatus<
          z.output<TDefinition["output"]>
        > | null> => {
          const job = await context.jobs.getStatus(id);
          return job?.type === runtimeType
            ? operatorJobStatus(definition, job)
            : null;
        },
      });
    },
    async status<TDefinition extends OperatorJobDefinition>(
      definition: TDefinition,
      id: string,
    ): Promise<OperatorJobStatus<z.output<TDefinition["output"]>> | null> {
      const runtimeType = getServiceJobRuntimeType(definition);
      const job = await context.jobs.getStatus(id);
      return job?.type === runtimeType
        ? operatorJobStatus(definition, job)
        : null;
    },
  };
}

async function createOperatorContext<
  TConfig,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
>(input: {
  readonly config: TConfig;
  readonly state: TState;
  readonly accountSettingsRegistration?: AccountSettingsRegistration<
    NonNullable<TAccountSettings>
  >;
  readonly provider: DashboardWidgetProviderContext;
  readonly context: ServicePluginContext;
}): Promise<OperatorBaseContext<TConfig, TState, TAccountSettings>> {
  const { caller, signal } = input.provider;
  signal.throwIfAborted();
  const permission = caller?.permission ?? "public";
  const visibilityScope = permissionToVisibilityScope(permission);
  const fullSettings =
    caller && input.accountSettingsRegistration
      ? await input.context.accountSettings.getForActor(
          input.accountSettingsRegistration,
          caller.actor.id,
        )
      : null;
  const settings =
    fullSettings && input.accountSettingsRegistration
      ? redactSettings(
          input.accountSettingsRegistration.definition,
          fullSettings,
        )
      : null;

  return {
    config: input.config,
    state: input.state,
    caller,
    settings,
    entities: {
      async get<TDefinition extends AnyEntityDefinition>(
        definition: TDefinition,
        id: string,
      ): Promise<EntityOf<TDefinition> | null> {
        signal.throwIfAborted();
        const entity = await input.context.entityService.getEntity({
          entityType: definition.type,
          id,
          visibilityScope,
        });
        signal.throwIfAborted();
        return entity ? parseDefinitionEntity(definition, entity) : null;
      },
      async list<TDefinition extends AnyEntityDefinition>(
        definition: TDefinition,
      ): Promise<readonly EntityOf<TDefinition>[]> {
        signal.throwIfAborted();
        const entities = await input.context.entityService.listEntities({
          entityType: definition.type,
          options: { filter: { visibilityScope } },
        });
        signal.throwIfAborted();
        return entities.map((entity) =>
          parseDefinitionEntity(definition, entity),
        );
      },
      async search<TDefinition extends AnyEntityDefinition>(
        definition: TDefinition,
        query: string,
      ): Promise<readonly EntityOf<TDefinition>[]> {
        signal.throwIfAborted();
        const results = await input.context.entityService.search({
          query,
          options: { types: [definition.type], visibilityScope },
        });
        signal.throwIfAborted();
        return results.map(({ entity }) =>
          parseDefinitionEntity(definition, entity),
        );
      },
    },
    jobs: createOperatorJobs(input.context),
    permissions: {
      allows(definition, action): boolean {
        try {
          input.context.permissions.assertEntityActionAllowed(
            definition.type,
            action,
            { userPermissionLevel: permission },
          );
          return true;
        } catch {
          return false;
        }
      },
    },
    signal,
  };
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
  readonly context: ServicePluginContext;
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
                tone: "plain",
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
