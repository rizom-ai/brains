import type { JsonValue } from "@brains/contracts";
import { createHash, randomUUID } from "node:crypto";
import { z } from "@brains/utils/zod";
import type { BasePluginContext } from "../base/context";
import {
  DECLARATIVE_STUDIO_WORKSPACE_RENDERER,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
} from "../types/studio-workspace";
import type { AnyAccountSettingsDefinition } from "./account-settings-definition-contract";
import type { AccountSettingsRegistration } from "./account-settings-registry";
import { meetsPermission } from "./contract-assertions";
import { createOperatorContext } from "./operator-context-runtime";
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
  type RuntimeOperatorValidationIssue,
} from "./operator-view-runtime";
import {
  getWorkspaceActionExecutor,
  type AnyWorkspaceActionDefinition,
  type BoundWorkspaceAction,
} from "./workspace-action-definition-contract";

interface RuntimeWorkspaceIdentity {
  readonly publicServiceId: string;
  readonly packageName: string;
  readonly workspaceId: string;
}

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
const PREPARED_CONFIRMATION_TTL_MS = 5 * 60 * 1_000;
const MAX_PREPARED_CONFIRMATIONS_PER_WORKSPACE = 1_000;

interface PreparedConfirmationRecord {
  readonly callerId: string;
  readonly actionId: string;
  readonly inputDigest: string;
  readonly revision: string;
  readonly expiresAt: number;
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] ?? null)}`)
    .join(",")}}`;
}

function inputDigest(value: JsonValue): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
const jsonValueSchema: z.ZodType<JsonValue, unknown> = z.json();

function createOperatorQueryReader(
  schema: OperatorSchema | undefined,
  rawQuery: unknown,
  identity: RuntimeWorkspaceIdentity,
): OperatorQueryReader {
  const parsed = schema?.safeParse(rawQuery ?? {});
  if (parsed && !parsed.success) {
    throw runtimeError(
      identity,
      "received invalid query state",
      validationDetail(parsed.error.issues),
    );
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

function runtimeError(
  identity: RuntimeWorkspaceIdentity,
  stage: string,
  detail?: string,
): Error {
  return new Error(
    `Service "${identity.publicServiceId}" package "${identity.packageName}" Studio workspace "${identity.workspaceId}" ${stage}${detail ? `: ${detail}` : ""}`,
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

function operatorCaller(actor: StudioWorkspaceActor): OperatorCaller {
  return Object.freeze({
    actor: Object.freeze({ id: actor.userId }),
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

function parseWorkspaceData<TSchema extends z.ZodType<unknown, unknown>>(
  schema: TSchema,
  input: unknown,
  identity: RuntimeWorkspaceIdentity,
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

function parseActionInput<TSchema extends z.ZodType<unknown, unknown>>(
  schema: TSchema,
  input: unknown,
): z.output<TSchema> {
  return schema.parse(input);
}

async function prepareActionBinding<
  TDefinition extends AnyWorkspaceActionDefinition,
  TConfig,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
>(
  binding: BoundWorkspaceAction<TDefinition, TConfig, TState, TAccountSettings>,
  context: OperatorBaseContext<TConfig, TState, TAccountSettings>,
  input: unknown,
): Promise<z.output<typeof preparedConfirmationSchema>> {
  const parsedInput = parseActionInput<TDefinition["input"]>(
    binding.definition.input,
    input,
  );
  const prepare = getWorkspaceActionExecutor(binding).prepare;
  if (!prepare) {
    throw new Error("Prepared confirmation callback is unavailable");
  }
  return preparedConfirmationSchema.parse(
    await prepare({ ...context, input: parsedInput }),
  );
}

async function executeActionBinding<
  TDefinition extends AnyWorkspaceActionDefinition,
  TConfig,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
>(
  binding: BoundWorkspaceAction<TDefinition, TConfig, TState, TAccountSettings>,
  context: OperatorBaseContext<TConfig, TState, TAccountSettings>,
  input: unknown,
): Promise<unknown> {
  const parsedInput = parseActionInput<TDefinition["input"]>(
    binding.definition.input,
    input,
  );
  return getWorkspaceActionExecutor(binding).execute({
    ...context,
    input: parsedInput,
  });
}

export function createDeclarativeStudioWorkspaceRegistration<
  TDefinition extends AnyStudioWorkspaceDefinition,
  TConfig,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
>(input: {
  readonly publicServiceId: string;
  readonly packageName: string;
  readonly runtimeWorkspaceId: string;
  readonly config: TConfig;
  readonly state: TState;
  readonly accountSettingsRegistration?: AccountSettingsRegistration<
    NonNullable<TAccountSettings>
  >;
  readonly binding: BoundStudioWorkspace<
    TDefinition,
    TConfig,
    TState,
    TAccountSettings
  >;
  readonly context: BasePluginContext;
  readonly runtimeSignal: AbortSignal;
}): Omit<StudioWorkspaceRegistration, "pluginId"> {
  const definition = input.binding.definition;
  const executor = getStudioWorkspaceExecutor(input.binding);
  const identity: RuntimeWorkspaceIdentity = {
    publicServiceId: input.publicServiceId,
    packageName: input.packageName,
    workspaceId: definition.id,
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
  const preparedConfirmations = new Map<string, PreparedConfirmationRecord>();

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
    });
    return Object.freeze({
      ...base,
      query: createOperatorQueryReader(definition.query, rawQuery, identity),
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
    const allowed = await executor.authorize(
      await contextFor(actor, signal, undefined),
    );
    if (typeof allowed !== "boolean") {
      throw runtimeError(
        identity,
        "authorization policy must return a boolean",
      );
    }
    return allowed;
  }
  const listEntityTypes = executor.listEntityTypes;

  return {
    id: input.runtimeWorkspaceId,
    label: definition.label,
    rendererName: DECLARATIVE_STUDIO_WORKSPACE_RENDERER,
    priority: definition.priority ?? 50,
    ...(definition.query ? { urlQuery: true } : {}),
    entityTypes: listEntityTypes
      ? async (actor): Promise<string[]> => {
          if (!(await admitted(actor, input.runtimeSignal))) return [];
          return entityTypeCatalogSchema.parse(
            await listEntityTypes(
              await contextFor(actor, input.runtimeSignal, undefined),
            ),
          );
        }
      : (definition.entities ?? []).map((entity) => entity.type),
    accessHandler: (actor) => admitted(actor, input.runtimeSignal),
    async dataProvider(
      actor,
      rawQuery,
      signal,
    ): Promise<RuntimeStudioWorkspaceData> {
      const combinedSignal = requestSignal(input.runtimeSignal, signal);
      combinedSignal.throwIfAborted();
      if (!(await admitted(actor, combinedSignal))) {
        throw runtimeError(
          identity,
          "was requested below its admission policy",
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
        throw runtimeError(identity, "data loader failed");
      }
      combinedSignal.throwIfAborted();
      const data = parseWorkspaceData(definition.data, rawData, identity);

      let rawView: unknown;
      try {
        rawView = definition.view({ data });
      } catch (error) {
        if (combinedSignal.aborted) {
          throw combinedSignal.reason ?? error;
        }
        throw runtimeError(identity, "view derivation failed");
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
        );
      }
      return Object.freeze({
        view: parsedView.data,
        ...(refreshAfterMs === undefined ? {} : { refreshAfterMs }),
      });
    },
    async actionHandler(rawRequest, actor, signal): Promise<JsonValue> {
      const combinedSignal = requestSignal(input.runtimeSignal, signal);
      combinedSignal.throwIfAborted();
      if (!(await admitted(actor, combinedSignal))) {
        throw runtimeError(
          identity,
          "action was requested below its admission policy",
        );
      }
      const request = actionRequestSchema.safeParse(rawRequest);
      if (!request.success) {
        throw runtimeError(identity, "received an invalid action request");
      }
      const binding = input.binding.actions.find(
        (candidate) => candidate.definition.name === request.data.actionId,
      );
      if (!binding) {
        throw runtimeError(
          identity,
          `does not declare action "${request.data.actionId}"`,
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
        );
      }
      const parsedInput = action.input.safeParse(request.data.input);
      if (!parsedInput.success) {
        throw runtimeError(
          identity,
          `action "${action.name}" received invalid input`,
          validationDetail(parsedInput.error.issues),
        );
      }
      const jsonInput = jsonValueSchema.safeParse(parsedInput.data);
      if (!jsonInput.success) {
        throw runtimeError(
          identity,
          `action "${action.name}" input must be JSON-native`,
        );
      }
      const runtimeContext = await contextFor(actor, combinedSignal, undefined);
      const conditionalConfirmation = conditionalPreparedInputSchema.safeParse(
        parsedInput.data,
      );
      const needsPreparedConfirmation =
        action.confirmation?.kind === "prepared" &&
        (action.confirmation.conditional !== true ||
          (conditionalConfirmation.success &&
            conditionalConfirmation.data.capability.confirmation ===
              "prepared"));
      if (request.data.mode === "prepare") {
        if (!needsPreparedConfirmation) {
          throw runtimeError(
            identity,
            `action "${action.name}" does not support prepared confirmation`,
          );
        }
        const prepared = await prepareActionBinding(
          binding,
          runtimeContext,
          parsedInput.data,
        );
        const now = Date.now();
        for (const [token, record] of preparedConfirmations) {
          if (record.expiresAt <= now) preparedConfirmations.delete(token);
        }
        while (
          preparedConfirmations.size >= MAX_PREPARED_CONFIRMATIONS_PER_WORKSPACE
        ) {
          const oldest = preparedConfirmations.keys().next();
          if (oldest.done) break;
          preparedConfirmations.delete(oldest.value);
        }
        const token = randomUUID();
        const expiresAt = now + PREPARED_CONFIRMATION_TTL_MS;
        preparedConfirmations.set(token, {
          callerId: actor.userId,
          actionId: action.name,
          inputDigest: inputDigest(jsonInput.data),
          revision: prepared.revision,
          expiresAt,
        });
        return {
          kind: "prepared-confirmation",
          token,
          summary: prepared.summary,
          expiresAt: new Date(expiresAt).toISOString(),
        };
      }
      if (needsPreparedConfirmation) {
        const token = request.data.confirmationToken;
        const record = token ? preparedConfirmations.get(token) : undefined;
        if (token) preparedConfirmations.delete(token);
        if (
          record === undefined ||
          record.expiresAt <= Date.now() ||
          record.callerId !== actor.userId ||
          record.actionId !== action.name ||
          record.inputDigest !== inputDigest(jsonInput.data)
        ) {
          throw runtimeError(
            identity,
            `action "${action.name}" prepared confirmation is invalid or stale`,
          );
        }
        let current: z.output<typeof preparedConfirmationSchema>;
        try {
          current = await prepareActionBinding(
            binding,
            runtimeContext,
            parsedInput.data,
          );
        } catch {
          throw runtimeError(
            identity,
            `action "${action.name}" prepared confirmation is invalid or stale`,
          );
        }
        if (current.revision !== record.revision) {
          throw runtimeError(
            identity,
            `action "${action.name}" prepared confirmation is invalid or stale`,
          );
        }
      }
      let rawOutput: unknown;
      try {
        rawOutput = await executeActionBinding(
          binding,
          runtimeContext,
          parsedInput.data,
        );
      } catch (error) {
        if (combinedSignal.aborted) {
          throw combinedSignal.reason ?? error;
        }
        throw runtimeError(identity, `action "${action.name}" failed`);
      }
      const parsedOutput = action.output.safeParse(rawOutput);
      if (!parsedOutput.success) {
        throw runtimeError(
          identity,
          `action "${action.name}" returned invalid output`,
          validationDetail(parsedOutput.error.issues),
        );
      }
      const jsonOutput = jsonValueSchema.safeParse(parsedOutput.data);
      if (!jsonOutput.success) {
        throw runtimeError(
          identity,
          `action "${action.name}" output must be JSON-native`,
        );
      }
      return jsonOutput.data;
    },
    ...(definition.badge
      ? {
          badgeProvider: async (
            actor: StudioWorkspaceActor,
          ): Promise<number> => {
            const signal = input.runtimeSignal;
            if (!(await admitted(actor, signal))) return 0;
            const data = parseWorkspaceData(
              definition.data,
              await executor.load(await contextFor(actor, signal, undefined)),
              identity,
            );
            const badge = definition.badge?.({ data }) ?? 0;
            if (!Number.isInteger(badge) || badge < 0 || badge > 999_999) {
              throw runtimeError(
                identity,
                "returned an invalid badge; use an integer from 0 to 999999",
              );
            }
            return badge;
          },
        }
      : {}),
  };
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

/** Bind and register a first-party workspace only when the Studio host exists. */
export async function registerBuiltInStudioWorkspace<
  TDefinition extends AnyStudioWorkspaceDefinition,
>(input: {
  readonly context: BasePluginContext;
  readonly definition: TDefinition;
  readonly bind: (
    context: BuiltInBindingContext,
  ) => BoundStudioWorkspace<
    TDefinition,
    Readonly<Record<string, never>>,
    Readonly<Record<string, never>>,
    undefined
  >;
  readonly runtimeSignal?: AbortSignal | undefined;
}): Promise<
  Awaited<ReturnType<BasePluginContext["studio"]["registerWorkspace"]>> | false
> {
  if (input.context.executionOnly || !input.context.studio.isAvailable()) {
    return false;
  }
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
    config: builtInBindingContext.config,
    state: builtInBindingContext.state,
    binding,
    context: input.context,
    runtimeSignal: input.runtimeSignal ?? new AbortController().signal,
  });
  return input.context.studio.registerWorkspace(registration);
}
