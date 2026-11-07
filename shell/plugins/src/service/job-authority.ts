import {
  callerAuthoritySchema,
  type Caller,
  type CallerAccess,
  type CallerAccountRule,
  type CallerAuthority,
} from "@brains/content-service";
import type { ToolContext } from "@brains/mcp-service";
import type { PermissionService } from "@brains/templates";
import { z } from "@brains/utils/zod";
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

/** A tool call's trusted caller, at the level its interface gave it. */
export function toolCaller(toolContext: ToolContext): Caller {
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
