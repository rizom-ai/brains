import {
  permissionToVisibilityScope,
  type ContentVisibility,
} from "@brains/entity-service";
import type { JobInfo } from "@brains/job-queue";
import { SdkError, type ActorRef } from "@brains/contracts";
import type { z } from "@brains/utils/zod";
import { createEntityReader } from "../entity/entity-reader";
import type {
  AnyEntityDefinition,
  DataSourceListOptions,
  EntityOf,
  EntityReader,
} from "../entity/entity-definition-contract";
import type { OwnedEntityWriter } from "../entity/owned-entity-writer";
import type { BasePluginContext } from "../base/context";
import type { Caller } from "@brains/content-service";
import { getServiceJobRuntimeType } from "../service/job-definition-runtime";
import { publicJobFailure, readJobResult } from "../service/job-status";
import { anonymousCaller } from "../service/job-authority";
import type {
  AccountSettingsValue,
  AnyAccountSettingsDefinition,
  AccountSettingsReader,
  RedactedAccountSettingsValue,
  ServiceAccountSettings,
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

/** Who an operator callback runs as: the caller a host resolved. */
export interface OperatorCallScope {
  readonly caller: OperatorCaller | null;
  /** The caller's actor as the host knows it, when it knows more than the id. */
  readonly actor?: ActorRef | undefined;
  readonly interfaceType: "studio" | "dashboard";
  /**
   * Set when the caller acts through a browser session of their own account,
   * as Studio's always does: a settings claim made there binds that session.
   */
  readonly browserSession?: true | undefined;
}

/**
 * Runs an operator callback as its caller. A service runs it in its own call
 * context, so every capability the package holds acts as that caller.
 */
export type OperatorRunAs = <T>(
  scope: OperatorCallScope,
  run: () => Promise<T>,
) => Promise<T>;

/** Reads that stop when the request does, before and after each read. */
export function readerWithin(
  reader: EntityReader,
  signal: AbortSignal,
): EntityReader {
  return Object.freeze({
    async get<TDefinition extends AnyEntityDefinition>(
      definition: TDefinition,
      id: string,
    ): Promise<EntityOf<TDefinition> | null> {
      signal.throwIfAborted();
      const record = await reader.get(definition, id);
      signal.throwIfAborted();
      return record;
    },
    async list<TDefinition extends AnyEntityDefinition>(
      definition: TDefinition,
      options?: DataSourceListOptions,
    ): Promise<readonly EntityOf<TDefinition>[]> {
      signal.throwIfAborted();
      const records = await reader.list(definition, options);
      signal.throwIfAborted();
      return records;
    },
    async count<TDefinition extends AnyEntityDefinition>(
      definition: TDefinition,
    ): Promise<number> {
      signal.throwIfAborted();
      const count = await reader.count(definition);
      signal.throwIfAborted();
      return count;
    },
  });
}

/** Writes that stop when the request does, beside the same bounded reads. */
export function accessWithin<TOwned extends AnyEntityDefinition>(
  access: EntityReader & OwnedEntityWriter<TOwned>,
  signal: AbortSignal,
): EntityReader & OwnedEntityWriter<TOwned> {
  const settled = async <T>(write: () => Promise<T>): Promise<T> => {
    signal.throwIfAborted();
    const written = await write();
    signal.throwIfAborted();
    return written;
  };
  const writer: OwnedEntityWriter<TOwned> = {
    create: (definition, input) =>
      settled(() => access.create(definition, input)),
    update: (definition, record, change) =>
      settled(() => access.update(definition, record, change)),
    delete: (definition, record) =>
      settled(() => access.delete(definition, record)),
  };
  return Object.freeze({ ...readerWithin(access, signal), ...writer });
}

/**
 * The account settings of a binding that keeps none of its own, such as a
 * first-party workspace or an entity type's widget: the types refuse every
 * call, and so does the runtime.
 */
export function noAccountSettings<
  TSettings extends AnyAccountSettingsDefinition,
>(): ServiceAccountSettings<TSettings> {
  const refuse = async (): Promise<never> => {
    throw new SdkError("permission_denied", {
      message: "This operator surface keeps no account settings",
    });
  };
  return Object.freeze({
    read: refuse,
    save: refuse,
    claim: refuse,
    redeem: refuse,
  });
}

/**
 * The writes of a binding that owns no entity types: the types refuse every
 * call, and so does the runtime.
 */
export function noOwnedWrites<
  TOwned extends AnyEntityDefinition,
>(): OwnedEntityWriter<TOwned> {
  const refuse = async (): Promise<never> => {
    throw new SdkError("permission_denied", {
      message: "This operator surface owns no entity types to write",
    });
  };
  return Object.freeze({ create: refuse, update: refuse, delete: refuse });
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

/** A job's status as a service's reader is told it: a failure in public form. */
function operatorJobStatus<TDefinition extends OperatorJobDefinition>(
  definition: TDefinition,
  job: JobInfo,
): OperatorJobStatus<z.output<TDefinition["output"]>> {
  const result = readJobResult<TDefinition["output"]>(definition.output, job);
  return Object.freeze({
    id: job.id,
    status: job.status,
    ...(result !== undefined ? { result } : {}),
    ...publicJobFailure(job),
  });
}

/** The viewer who starts a job: their account, or an anonymous viewer held to public. */
function operatorJobCaller(
  caller: OperatorCaller | null,
  pluginId: string,
): Caller {
  return caller
    ? {
        actor: { kind: "user", userId: caller.actor.id },
        permissionLevel: caller.permission,
      }
    : anonymousCaller(pluginId);
}

function createOperatorJobs(
  context: BasePluginContext,
  caller: OperatorCaller | null,
): OperatorJobs {
  return {
    async enqueue<TDefinition extends OperatorJobDefinition>(
      definition: TDefinition,
      input: z.input<TDefinition["input"]>,
    ): Promise<OperatorJobReference<TDefinition>> {
      const runtimeType = getServiceJobRuntimeType(definition);
      // Refused here, but queued as written: the worker parses it, once.
      definition.input.parse(input);
      const authority = await context.jobAuthority.admit(
        operatorJobCaller(caller, context.pluginId),
      );
      const id = await context.jobs.enqueue({
        type: runtimeType,
        data: { authority, input },
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

/**
 * The entity visibility an operator caller may read; no caller reads as
 * public. An unscoped entity read sees public entities only, so every
 * operator surface reads at this scope.
 */
export function callerVisibilityScope(
  caller: OperatorCaller | null,
): ContentVisibility {
  return permissionToVisibilityScope(caller?.permission ?? "public");
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
  /**
   * What the callback reads with: a service's own `entities`, which act as
   * the current caller; without one, reads at the caller's visibility.
   */
  readonly entities?: EntityReader | undefined;
  /** A service's own account settings, read for the current caller. */
  readonly accountSettings?:
    AccountSettingsReader<NonNullable<TAccountSettings>> | undefined;
}): Promise<OperatorBaseContext<TConfig, TState, TAccountSettings>> {
  const { caller, signal } = input.provider;
  signal.throwIfAborted();
  const permission = caller?.permission ?? "public";
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
    accountSettings:
      input.accountSettings ??
      noAccountSettings<NonNullable<TAccountSettings>>(),
    // As stored: the same record `list` hands back, with no read-time
    // resolution of image references into their data.
    entities: readerWithin(
      input.entities ??
        createEntityReader(
          input.context.entityService,
          callerVisibilityScope(caller),
        ),
      signal,
    ),
    jobs: createOperatorJobs(input.context, caller),
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
