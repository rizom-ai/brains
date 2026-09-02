import { permissionToVisibilityScope } from "@brains/entity-service";
import type { JobInfo } from "@brains/job-queue";
import type { z } from "@brains/utils/zod";
import { parseDefinitionEntity } from "../entity/declarative-entity-plugin";
import type {
  AnyEntityDefinition,
  EntityOf,
} from "../entity/entity-definition-contract";
import type { BasePluginContext } from "../base/context";
import { getServiceJobRuntimeType } from "../service/job-definition-runtime";
import type {
  AccountSettingsValue,
  AnyAccountSettingsDefinition,
  RedactedAccountSettingsValue,
} from "./account-settings-definition-contract";
import type { AccountSettingsRegistration } from "./account-settings-registry";
import type {
  OperatorBaseContext,
  OperatorCaller,
  OperatorJobDefinition,
  OperatorJobReference,
  OperatorJobs,
  OperatorJobStatus,
} from "./operator-context-contract";

export interface OperatorRuntimeProvider {
  readonly caller: OperatorCaller | null;
  readonly signal: AbortSignal;
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

function createOperatorJobs(context: BasePluginContext): OperatorJobs {
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

export async function createOperatorContext<
  TConfig,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
>(input: {
  readonly config: TConfig;
  readonly state: TState;
  readonly accountSettingsRegistration?: AccountSettingsRegistration<
    NonNullable<TAccountSettings>
  >;
  readonly provider: OperatorRuntimeProvider;
  readonly context: BasePluginContext;
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
          // assertEntityActionAllowed signals refusal by throwing. Adapting
          // it to a predicate means anything unexpected also reads as "not
          // allowed", which is the safe direction for a permission check.
          return false;
        }
      },
    },
    signal,
  };
}
