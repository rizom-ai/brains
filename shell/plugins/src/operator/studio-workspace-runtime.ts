import type { JsonValue } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import type { BasePluginContext } from "../base/context";
import {
  DECLARATIVE_STUDIO_WORKSPACE_RENDERER,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
} from "../types/studio-workspace";
import type {
  AnyAccountSettingsDefinition,
  ServiceAccountSettings,
} from "./account-settings-definition-contract";
import type { AccountSettingsRegistration } from "./account-settings-registry";
import { meetsPermission } from "./contract-assertions";
import type {
  AnyEntityDefinition,
  EntityReader,
} from "../entity/entity-definition-contract";
import type { OwnedEntityWriter } from "../entity/owned-entity-writer";
import {
  accessWithin,
  createOperatorContext,
  noAccountSettings,
  noOwnedWrites,
  type OperatorRunAs,
} from "./operator-context-runtime";
import type {
  OperatorBaseContext,
  OperatorBindingContext,
  OperatorCaller,
  OperatorQueryReader,
  OperatorSchema,
} from "./operator-context-contract";
import {
  getStudioWorkspaceExecutor,
  type AnyStudioWorkspaceDefinition,
  type BoundStudioWorkspace,
} from "./operator-definition-contract";
import {
  safeParseRuntimeStudioOperatorView,
  type RuntimeStudioWorkspaceData,
} from "./operator-view-runtime";
import { createPreparedConfirmationStore } from "./prepared-confirmation-store";
import {
  callbackFailure,
  parseOperatorData,
  refusedInput,
  reportedFailure,
  runtimeError,
  validationDetail,
  type OperatorRuntimeIdentity,
} from "./operator-runtime-errors";
import {
  getWorkspaceActionExecutor,
  isLaunchDestination,
  type AnyWorkspaceActionDefinition,
  type BoundWorkspaceAction,
  type WorkspaceActionLaunch,
} from "./workspace-action-definition-contract";

const actionRequestSchema = z
  .object({
    actionId: z.string().trim().min(1).max(120),
    input: z.unknown(),
    mode: z.enum(["prepare", "execute"]).default("execute"),
    confirmationToken: z.string().uuid().optional(),
  })
  .strict();
const conditionalPreparedInputSchema = z
  .object({
    capability: z.object({ confirmation: z.literal("prepared").optional() }),
  })
  .passthrough();
const entityTypeCatalogSchema = z
  .array(z.string().trim().min(1).max(120))
  .max(200)
  .transform((types) => [...new Set(types)]);
const preparedConfirmationSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  revision: z.string().trim().min(1).max(500),
});
const jsonValueSchema: ReturnType<typeof z.json> = z.json();
const launchOutputSchema = z.object({ url: z.string() });

function requiresPreparedConfirmation(
  action: AnyWorkspaceActionDefinition,
  input: unknown,
): boolean {
  if (action.confirmation?.kind !== "prepared") return false;
  if (action.confirmation.conditional !== true) return true;
  const conditional = conditionalPreparedInputSchema.safeParse(input);
  return (
    conditional.success &&
    conditional.data.capability.confirmation === "prepared"
  );
}

function createOperatorQueryReader(
  schema: OperatorSchema | undefined,
  rawQuery: unknown,
  identity: OperatorRuntimeIdentity,
): OperatorQueryReader {
  const parsed = schema?.safeParse(rawQuery ?? {});
  if (parsed && !parsed.success) {
    throw refusedInput(identity, "received invalid query state", parsed.error);
  }
  const value = parsed?.data;
  if (schema && !jsonValueSchema.safeParse(value).success) {
    throw runtimeError(identity, "query state must be JSON-native");
  }
  return Object.freeze({
    get<TSchema extends OperatorSchema>(requested: TSchema): z.output<TSchema> {
      if (requested !== schema) {
        throw runtimeError(
          identity,
          "query reader was called with a schema not declared by the workspace",
        );
      }
      return requested.parse(value);
    },
  });
}

function operatorCaller(actor: StudioWorkspaceActor): OperatorCaller {
  return Object.freeze({
    actor: Object.freeze({
      id: actor.userId,
      ...(actor.displayName ? { displayName: actor.displayName } : {}),
    }),
    permission: actor.userPermissionLevel,
    isAnchor: actor.isAnchor,
  });
}

function requestSignal(
  runtimeSignal: AbortSignal,
  signal: AbortSignal | undefined,
): AbortSignal {
  return signal ? AbortSignal.any([signal, runtimeSignal]) : runtimeSignal;
}

async function prepareActionBinding<
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
  context: OperatorBaseContext<TConfig, TState, TAccountSettings>,
  input: z.output<TDefinition["input"]>,
): Promise<unknown> {
  // Admission parsed the input once; a callback is handed that value.
  const prepare = getWorkspaceActionExecutor(binding).prepare;
  if (!prepare) {
    throw new Error("Prepared confirmation callback is unavailable");
  }
  return prepare({ ...context, input });
}

async function executeActionBinding<
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
  context: OperatorBaseContext<TConfig, TState, TAccountSettings>,
  writes: {
    readonly entities: EntityReader & OwnedEntityWriter<TOwned>;
    readonly accountSettings: ServiceAccountSettings<
      NonNullable<TAccountSettings>
    >;
  },
  input: z.output<TDefinition["input"]>,
): Promise<unknown> {
  return getWorkspaceActionExecutor(binding).execute({
    ...context,
    ...writes,
    input,
  });
}

export function createDeclarativeStudioWorkspaceRegistration<
  TDefinition extends AnyStudioWorkspaceDefinition,
  TConfig,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  TOwned extends AnyEntityDefinition = never,
>(input: {
  readonly publicServiceId: string;
  readonly packageName: string;
  readonly runtimeWorkspaceId: string;
  readonly aliases?: StudioWorkspaceRegistration["aliases"] | undefined;
  readonly config: TConfig;
  readonly state: TState;
  readonly accountSettingsRegistration?: AccountSettingsRegistration<
    NonNullable<TAccountSettings>
  >;
  readonly binding: BoundStudioWorkspace<
    TDefinition,
    TConfig,
    TState,
    TAccountSettings,
    TOwned
  >;
  readonly context: BasePluginContext;
  readonly runtimeSignal: AbortSignal;
  /**
   * A service's own `entities`, which act as the current caller: callbacks
   * read with it, and a workspace action writes the package's types with it.
   * Without one, callbacks read at the caller's visibility and write nothing.
   */
  readonly entities?: (EntityReader & OwnedEntityWriter<TOwned>) | undefined;
  /**
   * A service's own account settings writes, which act for the current
   * caller's account; without them, an action writes no settings.
   */
  readonly accountSettings?:
    ServiceAccountSettings<NonNullable<TAccountSettings>> | undefined;
  /** Runs each callback as its caller, in the declaring package's context. */
  readonly runAs?: OperatorRunAs | undefined;
}): Omit<StudioWorkspaceRegistration, "pluginId"> {
  const definition = input.binding.definition;
  const executor = getStudioWorkspaceExecutor(input.binding);
  const identity: OperatorRuntimeIdentity = {
    publicServiceId: input.publicServiceId,
    packageName: input.packageName,
    surface: "Studio workspace",
    id: definition.id,
  };
  if (definition.query) {
    const initialQuery = definition.query.safeParse({});
    if (!initialQuery.success) {
      throw runtimeError(
        identity,
        "declares a query schema without a valid empty/default state",
        validationDetail(initialQuery.error.issues),
      );
    }
    if (!jsonValueSchema.safeParse(initialQuery.data).success) {
      throw runtimeError(identity, "query state must be JSON-native");
    }
  }
  const preparedConfirmations = createPreparedConfirmationStore();

  async function contextFor(
    actor: StudioWorkspaceActor,
    signal: AbortSignal,
    rawQuery: unknown,
  ): Promise<
    OperatorBaseContext<TConfig, TState, TAccountSettings> & {
      readonly query: OperatorQueryReader;
    }
  > {
    const base = await createOperatorContext({
      config: input.config,
      state: input.state,
      ...(input.accountSettingsRegistration
        ? { accountSettingsRegistration: input.accountSettingsRegistration }
        : {}),
      provider: { caller: operatorCaller(actor), signal },
      context: input.context,
      entities: input.entities,
      accountSettings: input.accountSettings,
    });
    return Object.freeze({
      ...base,
      query: createOperatorQueryReader(definition.query, rawQuery, identity),
    });
  }

  /** The operator's request, run as them in the declaring package. */
  function asOperator<T>(
    actor: StudioWorkspaceActor,
    run: () => Promise<T>,
  ): Promise<T> {
    return input.runAs
      ? input.runAs(
          {
            caller: operatorCaller(actor),
            actor: actor.actor,
            interfaceType: "studio",
            // Studio resolves every request's caller from its browser session.
            browserSession: true,
          },
          run,
        )
      : run();
  }

  /** What an action writes with: the package's own types, as the operator. */
  function actionEntities(
    runtimeContext: OperatorBaseContext<TConfig, TState, TAccountSettings>,
  ): EntityReader & OwnedEntityWriter<TOwned> {
    return input.entities
      ? accessWithin(input.entities, runtimeContext.signal)
      : Object.freeze({
          ...runtimeContext.entities,
          ...noOwnedWrites<TOwned>(),
        });
  }

  async function admitted(
    actor: StudioWorkspaceActor,
    signal: AbortSignal,
  ): Promise<boolean> {
    if (!meetsPermission(actor.userPermissionLevel, definition.permission)) {
      return false;
    }
    if (!executor.authorize) return true;
    const context = await contextFor(actor, signal, undefined);
    let allowed: unknown;
    try {
      allowed = await executor.authorize(context);
    } catch (error) {
      if (signal.aborted) throw signal.reason ?? error;
      throw callbackFailure(identity, "authorization policy failed", error);
    }
    if (typeof allowed !== "boolean") {
      throw runtimeError(
        identity,
        "authorization policy must return a boolean",
        undefined,
        { code: "invalid_response" },
      );
    }
    return allowed;
  }

  /**
   * A failure leaves in its public form; its diagnostic, and what caused it,
   * stay in the declaring package's log. A request that went is not logged.
   */
  function reported<T>(
    signal: AbortSignal | undefined,
    run: () => Promise<T>,
  ): Promise<T> {
    return reportedFailure(
      input.context.logger,
      [signal, input.runtimeSignal],
      run,
    );
  }

  type RuntimeContext = Awaited<ReturnType<typeof contextFor>>;
  interface ParsedActionRequest {
    readonly binding: (typeof input.binding.actions)[number];
    readonly mode: "prepare" | "execute";
    readonly confirmationToken: string | undefined;
    /** Parsed once, here: every callback is handed this value. */
    readonly input: z.output<TDefinition["actions"][number]["input"]>;
    readonly jsonInput: JsonValue;
  }

  function parseActionRequest(
    rawRequest: unknown,
    actor: StudioWorkspaceActor,
  ): ParsedActionRequest {
    const request = actionRequestSchema.safeParse(rawRequest);
    if (!request.success) {
      throw refusedInput(
        identity,
        "received an invalid action request",
        request.error,
      );
    }
    const binding = input.binding.actions.find(
      (candidate) => candidate.definition.name === request.data.actionId,
    );
    if (!binding) {
      throw runtimeError(
        identity,
        `does not declare action "${request.data.actionId}"`,
        undefined,
        {
          code: "not_found",
          publicMessage: "This workspace has no such action",
        },
      );
    }
    const action = binding.definition;
    if (
      action.permission !== undefined &&
      !meetsPermission(actor.userPermissionLevel, action.permission)
    ) {
      throw runtimeError(
        identity,
        `action "${action.name}" was requested below its minimum permission`,
        undefined,
        { code: "permission_denied" },
      );
    }
    const parsedInput = z.safeParse<TDefinition["actions"][number]["input"]>(
      action.input,
      request.data.input,
    );
    if (!parsedInput.success) {
      throw refusedInput(
        identity,
        `action "${action.name}" received invalid input`,
        parsedInput.error,
      );
    }
    const jsonInput = jsonValueSchema.safeParse(parsedInput.data);
    if (!jsonInput.success) {
      throw runtimeError(
        identity,
        `action "${action.name}" input must be JSON-native`,
        undefined,
        { code: "invalid_input" },
      );
    }
    return {
      binding,
      mode: request.data.mode,
      confirmationToken: request.data.confirmationToken,
      input: parsedInput.data,
      jsonInput: jsonInput.data,
    };
  }

  async function issuePreparedConfirmation(
    request: ParsedActionRequest,
    actor: StudioWorkspaceActor,
    runtimeContext: RuntimeContext,
  ): Promise<JsonValue> {
    const prepared = await prepareSummary(request, runtimeContext);
    // A request that went while the summary was written gets no token.
    runtimeContext.signal.throwIfAborted();
    const { token, expiresAt } = preparedConfirmations.issue({
      callerId: actor.userId,
      actionId: request.binding.definition.name,
      input: request.jsonInput,
      revision: prepared.revision,
    });
    return {
      kind: "prepared-confirmation",
      token,
      summary: prepared.summary,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  /** The summary an action's `prepare` writes, held to its shape. */
  async function prepareSummary(
    request: ParsedActionRequest,
    runtimeContext: RuntimeContext,
  ): Promise<z.output<typeof preparedConfirmationSchema>> {
    const actionName = request.binding.definition.name;
    let raw: unknown;
    try {
      raw = await prepareActionBinding(
        request.binding,
        runtimeContext,
        request.input,
      );
    } catch (error) {
      if (runtimeContext.signal.aborted) {
        throw runtimeContext.signal.reason ?? error;
      }
      throw callbackFailure(
        identity,
        `action "${actionName}" prepare failed`,
        error,
      );
    }
    const prepared = preparedConfirmationSchema.safeParse(raw);
    if (!prepared.success) {
      throw runtimeError(
        identity,
        `action "${actionName}" prepared an invalid confirmation`,
        validationDetail(prepared.error.issues),
        { code: "invalid_response" },
      );
    }
    return prepared.data;
  }

  async function confirmPreparedConfirmation(
    request: ParsedActionRequest,
    actor: StudioWorkspaceActor,
    runtimeContext: RuntimeContext,
  ): Promise<void> {
    const actionName = request.binding.definition.name;
    const stale = (cause?: unknown): Error =>
      runtimeError(
        identity,
        `action "${actionName}" prepared confirmation is invalid or stale`,
        undefined,
        {
          code: "conflict",
          publicMessage: "The confirmation is no longer current; confirm again",
          cause,
        },
      );
    const redeemed = preparedConfirmations.redeem(request.confirmationToken, {
      callerId: actor.userId,
      actionId: actionName,
      input: request.jsonInput,
    });
    if (!redeemed) throw stale();
    const current = await prepareSummary(request, runtimeContext).catch(
      (error: unknown): never => {
        if (runtimeContext.signal.aborted) {
          throw runtimeContext.signal.reason ?? error;
        }
        // Whatever stopped prepare from answering again, what was confirmed
        // can no longer be compared: the operator confirms afresh.
        throw stale(error);
      },
    );
    runtimeContext.signal.throwIfAborted();
    if (current.revision !== redeemed.revision) throw stale();
  }

  async function executeAction(
    request: ParsedActionRequest,
    runtimeContext: RuntimeContext,
    signal: AbortSignal,
  ): Promise<JsonValue> {
    const action = request.binding.definition;
    let rawOutput: unknown;
    try {
      rawOutput = await executeActionBinding(
        request.binding,
        runtimeContext,
        {
          entities: actionEntities(runtimeContext),
          accountSettings:
            input.accountSettings ??
            noAccountSettings<NonNullable<TAccountSettings>>(),
        },
        request.input,
      );
    } catch (error) {
      if (signal.aborted) {
        throw signal.reason ?? error;
      }
      throw callbackFailure(identity, `action "${action.name}" failed`, error);
    }
    // An action whose request went while it ran answers with the
    // cancellation, whatever its callback returned.
    signal.throwIfAborted();
    const parsedOutput = action.output.safeParse(rawOutput);
    if (!parsedOutput.success) {
      throw runtimeError(
        identity,
        `action "${action.name}" returned invalid output`,
        validationDetail(parsedOutput.error.issues),
        { code: "invalid_response", cause: parsedOutput.error },
      );
    }
    if (action.launch) return launchFor(action.name, action.launch, rawOutput);
    const jsonOutput = jsonValueSchema.safeParse(parsedOutput.data);
    if (!jsonOutput.success) {
      throw runtimeError(
        identity,
        `action "${action.name}" output must be JSON-native`,
        undefined,
        { code: "invalid_response" },
      );
    }
    return jsonOutput.data;
  }

  /**
   * Where a launch sends the browser, checked before it moves: an absolute
   * https URL on an origin the action declares, carrying no credentials.
   */
  function launchFor(
    actionName: string,
    launch: WorkspaceActionLaunch,
    output: unknown,
  ): JsonValue {
    const destination = launchOutputSchema.safeParse(output);
    if (
      !destination.success ||
      !isLaunchDestination(launch, destination.data.url)
    ) {
      throw runtimeError(
        identity,
        `action "${actionName}" launched outside its declared origins (${launch.origins.join(", ")})`,
        undefined,
        { code: "invalid_response" },
      );
    }
    return { kind: "launch", url: new URL(destination.data.url).href };
  }
  const listEntityTypes = executor.listEntityTypes;

  return {
    id: input.runtimeWorkspaceId,
    label: definition.label,
    rendererName: DECLARATIVE_STUDIO_WORKSPACE_RENDERER,
    priority: definition.priority ?? 50,
    permission: definition.permission,
    ...(definition.query ? { urlQuery: true } : {}),
    ...(input.aliases ? { aliases: input.aliases } : {}),
    ...(definition.publishesEntityTypes ? { publishesEntityTypes: true } : {}),
    entityTypes: listEntityTypes
      ? (actor): Promise<string[]> =>
          asOperator(actor, () =>
            reported(undefined, async () => {
              if (!(await admitted(actor, input.runtimeSignal))) return [];
              const types = await listEntityTypes(
                await contextFor(actor, input.runtimeSignal, undefined),
              );
              const parsed = entityTypeCatalogSchema.safeParse(types);
              if (!parsed.success) {
                throw runtimeError(
                  identity,
                  "returned an invalid entity-type catalog",
                  validationDetail(parsed.error.issues),
                  { code: "invalid_response" },
                );
              }
              return parsed.data;
            }),
          )
      : (definition.entities ?? []).map((entity) => entity.type),
    accessHandler: (actor) =>
      asOperator(actor, () =>
        reported(undefined, () => admitted(actor, input.runtimeSignal)),
      ),
    dataProvider: (actor, rawQuery, signal) =>
      asOperator(actor, () =>
        reported(signal, () => loadWorkspace(actor, rawQuery, signal)),
      ),
    actionHandler: (rawRequest, actor, signal) =>
      asOperator(actor, () =>
        reported(signal, () => handleAction(rawRequest, actor, signal)),
      ),
    ...(definition.badge
      ? {
          badgeProvider: (actor: StudioWorkspaceActor): Promise<number> =>
            asOperator(actor, () =>
              reported(undefined, () => countBadge(actor)),
            ),
        }
      : {}),
  };

  async function loadWorkspace(
    actor: StudioWorkspaceActor,
    rawQuery: unknown,
    signal: AbortSignal | undefined,
  ): Promise<RuntimeStudioWorkspaceData> {
    const combinedSignal = requestSignal(input.runtimeSignal, signal);
    combinedSignal.throwIfAborted();
    if (!(await admitted(actor, combinedSignal))) {
      throw runtimeError(
        identity,
        "was requested below its admission policy",
        undefined,
        { code: "permission_denied" },
      );
    }
    const runtimeContext = await contextFor(actor, combinedSignal, rawQuery);
    let rawData: unknown;
    try {
      rawData = await executor.load(runtimeContext);
    } catch (error) {
      if (combinedSignal.aborted) {
        throw combinedSignal.reason ?? error;
      }
      throw callbackFailure(identity, "data loader failed", error);
    }
    combinedSignal.throwIfAborted();
    const data = parseOperatorData(definition.data, rawData, identity);

    let rawView: unknown;
    try {
      rawView = definition.view({ data });
    } catch (error) {
      if (combinedSignal.aborted) {
        throw combinedSignal.reason ?? error;
      }
      throw callbackFailure(identity, "view derivation failed", error);
    }
    const parsedView = safeParseRuntimeStudioOperatorView(rawView, {
      actions: definition.actions,
      permission: actor.userPermissionLevel,
    });
    if (!parsedView.success) {
      throw runtimeError(
        identity,
        "returned an invalid view; use supported StudioWorkspaceView blocks and declared actions",
        validationDetail(parsedView.issues),
        { code: "invalid_response" },
      );
    }
    const refreshAfterMs = definition.refresh?.({ data });
    if (
      refreshAfterMs !== undefined &&
      (!Number.isInteger(refreshAfterMs) ||
        refreshAfterMs < 500 ||
        refreshAfterMs > 60_000)
    ) {
      throw runtimeError(
        identity,
        "returned an invalid refresh interval; use 500-60000 milliseconds",
        undefined,
        { code: "invalid_response" },
      );
    }
    return Object.freeze({
      view: parsedView.data,
      ...(refreshAfterMs === undefined ? {} : { refreshAfterMs }),
    });
  }

  async function handleAction(
    rawRequest: unknown,
    actor: StudioWorkspaceActor,
    signal: AbortSignal | undefined,
  ): Promise<JsonValue> {
    const combinedSignal = requestSignal(input.runtimeSignal, signal);
    combinedSignal.throwIfAborted();
    if (!(await admitted(actor, combinedSignal))) {
      throw runtimeError(
        identity,
        "action was requested below its admission policy",
        undefined,
        { code: "permission_denied" },
      );
    }
    const request = parseActionRequest(rawRequest, actor);
    const runtimeContext = await contextFor(actor, combinedSignal, undefined);
    const needsPreparedConfirmation = requiresPreparedConfirmation(
      request.binding.definition,
      request.input,
    );
    if (request.mode === "prepare") {
      if (!needsPreparedConfirmation) {
        throw runtimeError(
          identity,
          `action "${request.binding.definition.name}" does not support prepared confirmation`,
          undefined,
          { code: "invalid_input" },
        );
      }
      return issuePreparedConfirmation(request, actor, runtimeContext);
    }
    if (needsPreparedConfirmation) {
      await confirmPreparedConfirmation(request, actor, runtimeContext);
    }
    return executeAction(request, runtimeContext, combinedSignal);
  }

  async function countBadge(actor: StudioWorkspaceActor): Promise<number> {
    const signal = input.runtimeSignal;
    if (!(await admitted(actor, signal))) return 0;
    const context = await contextFor(actor, signal, undefined);
    const raw = await Promise.resolve(executor.load(context)).catch(
      (error: unknown): never => {
        throw callbackFailure(identity, "data loader failed", error);
      },
    );
    const data = parseOperatorData(definition.data, raw, identity);
    const badge = definition.badge?.({ data }) ?? 0;
    if (!Number.isInteger(badge) || badge < 0 || badge > 999_999) {
      throw runtimeError(
        identity,
        "returned an invalid badge; use an integer from 0 to 999999",
        undefined,
        { code: "invalid_response" },
      );
    }
    return badge;
  }
}

const builtInBindingContext = Object.freeze({
  config: Object.freeze({}),
  state: Object.freeze({}),
  accountSettings: undefined,
});

type BuiltInBindingContext = OperatorBindingContext<
  Readonly<Record<string, never>>,
  Readonly<Record<string, never>>,
  undefined
>;

interface BuiltInStudioWorkspaceInput<
  TDefinition extends AnyStudioWorkspaceDefinition,
> {
  readonly context: BasePluginContext;
  readonly definition: TDefinition;
  readonly aliases?:
    | readonly {
        readonly id: string;
        readonly query: Readonly<Record<string, string>>;
      }[]
    | undefined;
  readonly bind: (
    context: BuiltInBindingContext,
  ) => BoundStudioWorkspace<
    TDefinition,
    Readonly<Record<string, never>>,
    Readonly<Record<string, never>>,
    undefined
  >;
  readonly runtimeSignal?: AbortSignal | undefined;
}

/**
 * A first-party workspace a service builds through its runtime: the
 * definition and its binding, without the plugin context the runtime
 * supplies.
 */
export type BuiltInStudioWorkspaceSource<
  TDefinition extends AnyStudioWorkspaceDefinition,
> = Omit<BuiltInStudioWorkspaceInput<TDefinition>, "context" | "runtimeSignal">;

/** Bind a first-party definition without exposing its executor to providers. */
export function createBuiltInStudioWorkspaceRegistration<
  TDefinition extends AnyStudioWorkspaceDefinition,
>(
  input: BuiltInStudioWorkspaceInput<TDefinition>,
): Omit<StudioWorkspaceRegistration, "pluginId"> {
  const binding = input.bind(builtInBindingContext);
  if (binding.definition !== input.definition) {
    throw new Error(
      `Built-in Studio binding for "${input.definition.id}" returned a different definition`,
    );
  }
  const runtimeWorkspaceId = `${input.context.pluginId}:${input.definition.id}`;
  const registration = createDeclarativeStudioWorkspaceRegistration({
    publicServiceId: input.context.pluginId,
    packageName: input.context.pluginId,
    runtimeWorkspaceId,
    ...(input.aliases
      ? {
          aliases: input.aliases.map((alias) => ({
            id: `${input.context.pluginId}:${alias.id}`,
            query: alias.query,
          })),
        }
      : {}),
    config: builtInBindingContext.config,
    state: builtInBindingContext.state,
    binding,
    context: input.context,
    runtimeSignal: input.runtimeSignal ?? new AbortController().signal,
  });
  return registration;
}

/** Bind and register a first-party workspace only when the Studio host exists. */
export async function registerBuiltInStudioWorkspace<
  TDefinition extends AnyStudioWorkspaceDefinition,
>(
  input: BuiltInStudioWorkspaceInput<TDefinition>,
): Promise<
  Awaited<ReturnType<BasePluginContext["studio"]["registerWorkspace"]>> | false
> {
  if (input.context.executionOnly || !input.context.studio.isAvailable()) {
    return false;
  }
  return input.context.studio.registerWorkspace(
    createBuiltInStudioWorkspaceRegistration(input),
  );
}

/**
 * The Studio a first-party package composes workspaces for, as its class
 * registered them: a declared workspace built under the plugin's id as a
 * source, and a composed one registered once, never from a worker.
 */
export interface FirstPartyStudio {
  /** Whether a Studio hosts workspaces in this process: never in a worker. */
  isAvailable(): boolean;
  source<TDefinition extends AnyStudioWorkspaceDefinition>(
    input: BuiltInStudioWorkspaceSource<TDefinition>,
  ): Omit<StudioWorkspaceRegistration, "pluginId">;
  /** The URL Studio serves it at, or none without a Studio or in a worker. */
  register(
    registration: Omit<StudioWorkspaceRegistration, "pluginId">,
  ): Promise<string | undefined>;
  /**
   * Take a workspace this plugin registered off Studio, as a class did when
   * it shut down: whether Studio took it off, false without a Studio.
   */
  unregister(workspaceId: string): Promise<boolean>;
}

/** The Studio a plugin context reaches, for a first-party runtime. */
export function firstPartyStudioOf(
  context: BasePluginContext,
): FirstPartyStudio {
  return Object.freeze<FirstPartyStudio>({
    isAvailable: (): boolean =>
      !context.executionOnly && context.studio.isAvailable(),
    source: (input) =>
      createBuiltInStudioWorkspaceRegistration({ ...input, context }),
    register: async (registration): Promise<string | undefined> => {
      if (context.executionOnly || !context.studio.isAvailable()) {
        return undefined;
      }
      const result = await context.studio.registerWorkspace(registration);
      return result === false ? undefined : result.workspaceUrl;
    },
    unregister: (workspaceId): Promise<boolean> =>
      context.studio.unregisterWorkspace(workspaceId),
  });
}
