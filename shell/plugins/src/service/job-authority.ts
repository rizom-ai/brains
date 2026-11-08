import {
  callerAuthoritySchema,
  type Caller,
  type CallerAccess,
  type CallerAccountRule,
  type CallerAuthority,
} from "@brains/content-service";
import type { ActorRef } from "@brains/contracts";
import {
  internalFullScope,
  type ContentVisibility,
} from "@brains/entity-service";
import type { ToolContext } from "@brains/mcp-service";
import type { PermissionService } from "@brains/templates";
import { z } from "@brains/utils/zod";
import type {
  AnyEntityDefinition,
  DataSourceListOptions,
  EntityOf,
  EntityReader,
} from "../entity/entity-definition-contract";
import { createEntityReader } from "../entity/entity-reader";
import type { IShell } from "../interfaces";
import type { ServiceSchema } from "./service-definition-contract";

/**
 * A package job needs no account: a caller its interface admitted without one
 * (a web-chat guest, local MCP without an auth runtime) is held to the level
 * it was admitted at, so a job never reads more than the request that started
 * it. A user whose account is gone is still refused.
 */
const packageJobAccount: CallerAccountRule = "optional";

/** Who starts a package job: recorded at enqueue, re-checked when it runs. */
export interface IJobAuthorityNamespace {
  /** Admit the request's caller; without one, this plugin acting for itself. */
  admit(caller: Caller | undefined): Promise<CallerAuthority>;
  /** Current access for a recorded requester; refuses a revoked or rebound account. */
  resolve(authority: CallerAuthority): Promise<CallerAccess>;
  /** Current access for a caller acting now; without one, this plugin acting for itself. */
  access(caller: Caller | undefined): Promise<CallerAccess>;
}

/**
 * A tool call's trusted caller, at the level its interface gave it; a create
 * route's caller is a tool call's, through the system tool that routed it.
 */
export function toolCaller(
  toolContext: Pick<ToolContext, "actor" | "userPermissionLevel">,
): Caller {
  return {
    actor: toolContext.actor,
    permissionLevel: toolContext.userPermissionLevel ?? "public",
  };
}

/** A plugin acting for itself: its configured grant, never ambient admin. */
export function serviceCaller(
  pluginId: string,
  permissions: Pick<PermissionService, "determineUserLevel">,
): Caller {
  return {
    actor: { kind: "service", serviceId: pluginId },
    permissionLevel: permissions.determineUserLevel("service", pluginId),
  };
}

/** An anonymous request a plugin serves: the plugin, held to public. */
export function anonymousCaller(pluginId: string): Caller {
  return {
    actor: { kind: "service", serviceId: pluginId },
    permissionLevel: "public",
  };
}

/** Reads the shell's authorizer per call, so it always sees current grants. */
export function createJobAuthorityNamespace(
  shell: IShell,
  pluginId: string,
): IJobAuthorityNamespace {
  return {
    admit: async (caller): Promise<CallerAuthority> => {
      const { authority } = await shell
        .getCallerAuthorizer()
        .admit(
          caller ?? serviceCaller(pluginId, shell.getPermissionService()),
          packageJobAccount,
        );
      return authority;
    },
    resolve: (authority): Promise<CallerAccess> =>
      shell.getCallerAuthorizer().resolve(authority, packageJobAccount),
    access: async (caller): Promise<CallerAccess> => {
      const { access } = await shell
        .getCallerAuthorizer()
        .admit(
          caller ?? serviceCaller(pluginId, shell.getPermissionService()),
          packageJobAccount,
        );
      return access;
    },
  };
}

type ServiceJobDataSchema = z.ZodObject<{
  authority: typeof callerAuthoritySchema;
  input: z.ZodUnknown;
  byPackage: z.ZodOptional<z.ZodLiteral<true>>;
}>;

/**
 * A package job's queued data: who started it, and its input as written.
 * The queue checks the input against the job's schema when the job is
 * queued and again when it runs, but keeps it as written: the job's handler
 * parses it, once. `byPackage` marks a job the package queued acting as
 * itself, which runs as the package too; the runtime alone writes it.
 */
export function serviceJobDataSchema(
  input: ServiceSchema,
): ServiceJobDataSchema {
  return z.object({
    authority: callerAuthoritySchema,
    input: z.unknown().refine((value) => input.safeParse(value).success, {
      message: "Job input does not match its schema",
    }),
    byPackage: z.literal(true).optional(),
  });
}

export type ServiceJobData = z.output<ServiceJobDataSchema>;

/**
 * Who a package's work acts as right now: the access it reads and writes at.
 * Service and entity packages share it, so both sides of the SDK read the
 * same way.
 */
export interface PackageCall {
  access(): Promise<CallerAccess>;
  /**
   * The package acting as itself, with no caller: its own types are its to
   * read and write, as a class plugin's are, past the policy callers meet.
   */
  readonly asPackage?: boolean | undefined;
}

/**
 * The package acting as itself, with no caller behind it: in an answer, a
 * scheduled check or run, an eval, or a listing nobody in particular asked
 * for. It reads at its own grant, resolved on each use so it sees current
 * grants, and its own types at every visibility.
 */
export function packageSelfCall(
  jobAuthority: Pick<IJobAuthorityNamespace, "access">,
): PackageCall {
  return { access: () => jobAuthority.access(undefined), asPackage: true };
}

/** A queued job's call: its requester, to whom its writes are attributed. */
export interface QueuedJobCall extends PackageCall {
  readonly eventContext: { readonly actor: ActorRef };
}

/**
 * A package job's queued data, admitted now: who starts it, and its input as
 * written. Without a caller the package queues the job for itself, and the
 * job runs as the package.
 */
export async function admitPackageJob(
  jobAuthority: Pick<IJobAuthorityNamespace, "admit">,
  caller: Caller | undefined,
  input: unknown,
): Promise<ServiceJobData> {
  return {
    authority: await jobAuthority.admit(caller),
    input,
    ...(caller === undefined ? { byPackage: true } : {}),
  };
}

/**
 * The call a queued package job runs as: its requester's current access,
 * never more than it was admitted at, or the package itself when it queued
 * the job for itself. A revoked or rebound requester is refused here, before
 * the job reads anything.
 */
export async function queuedJobCall(
  jobAuthority: Pick<IJobAuthorityNamespace, "resolve">,
  { authority, byPackage }: Pick<ServiceJobData, "authority" | "byPackage">,
): Promise<QueuedJobCall> {
  const access = await jobAuthority.resolve(authority);
  return {
    access: () => Promise.resolve(access),
    asPackage: byPackage === true,
    eventContext: { actor: authority.actor },
  };
}

/**
 * Where a call reads a type: the package acting as itself sees its own types
 * at every visibility, and everything else at the call's access.
 */
export function packageReadScope(
  call: Pick<PackageCall, "asPackage">,
  ownsType: boolean,
  access: CallerAccess,
): ContentVisibility {
  return call.asPackage === true && ownsType
    ? internalFullScope("a package acting as itself reads its own types")
    : access.visibilityScope;
}

/** Definition-typed reads as the current call, each type at its `packageReadScope`. */
export function createPackageEntityReader(
  entityService: Parameters<typeof createEntityReader>[0],
  currentCall: () => PackageCall,
  ownsType: (entityType: string) => boolean,
): EntityReader {
  const reader = async (entityType: string): Promise<EntityReader> => {
    const call = currentCall();
    return createEntityReader(
      entityService,
      packageReadScope(call, ownsType(entityType), await call.access()),
    );
  };
  return Object.freeze({
    get: async <TDefinition extends AnyEntityDefinition>(
      definition: TDefinition,
      id: string,
    ): Promise<EntityOf<TDefinition> | null> =>
      (await reader(definition.type)).get(definition, id),
    list: async <TDefinition extends AnyEntityDefinition>(
      definition: TDefinition,
      options?: DataSourceListOptions,
    ): Promise<readonly EntityOf<TDefinition>[]> =>
      (await reader(definition.type)).list(definition, options),
    count: async (definition: AnyEntityDefinition): Promise<number> =>
      (await reader(definition.type)).count(definition),
  });
}
