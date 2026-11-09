import { actorRefSchema, type ActorRef } from "@brains/contracts";
import {
  permissionToVisibilityScope,
  type ContentVisibility,
} from "@brains/entity-service";
import {
  PermissionService,
  UserPermissionLevelSchema,
  type UserPermissionLevel,
} from "@brains/templates";
import { z } from "@brains/utils/zod";

type CallerSchema = z.ZodObject<{
  actor: typeof actorRefSchema;
  permissionLevel: typeof UserPermissionLevelSchema;
}>;

/** Supplied by a trusted runtime binding, never by a tool's input schema. */
export const callerSchema: CallerSchema = z.object({
  actor: actorRefSchema,
  permissionLevel: UserPermissionLevelSchema,
});

export type Caller = z.output<typeof callerSchema>;

const callerAuthorityShape: z.ZodObject<{
  actor: typeof actorRefSchema;
  permissionCeiling: typeof UserPermissionLevelSchema;
  principalId: z.ZodOptional<z.ZodString>;
}> = z.object({
  actor: actorRefSchema,
  permissionCeiling: UserPermissionLevelSchema,
  principalId: z.string().min(1).optional(),
});

/** Durable delegation: the requester, its account binding, and an admission-time ceiling. */
export type CallerAuthority = z.output<typeof callerAuthorityShape>;

/**
 * Validates a recorded authority. A user is always bound to its own account
 * and a service or agent never is; an external caller may be unbound, which
 * a use that requires an account refuses separately.
 */
export const callerAuthoritySchema: z.ZodType<CallerAuthority, unknown> =
  callerAuthorityShape.superRefine(({ actor, principalId }, context) => {
    const accountActor = actor.kind === "user" || actor.kind === "external";
    if (
      (!accountActor && principalId !== undefined) ||
      (actor.kind === "user" && actor.userId !== principalId)
    ) {
      context.addIssue({
        code: "custom",
        message: "Invalid caller account binding",
      });
    }
  });

/**
 * Whether a user or external caller must resolve to an account. A use that
 * does not require one holds an unbound external caller to the level it was
 * admitted at; a user is refused without its account either way.
 */
export type CallerAccountRule = "required" | "optional";

export interface CallerAccess {
  permissionLevel: UserPermissionLevel;
  visibilityScope: ContentVisibility;
}

export interface CallerPrincipal {
  userId: string;
  permissionLevel: UserPermissionLevel;
}

export type PrincipalResolver = (
  actor: ActorRef,
) => Promise<CallerPrincipal | null>;

/** What one principal lookup establishes: the authority to record and the access it grants now. */
export interface CallerAdmission {
  authority: CallerAuthority;
  access: CallerAccess;
}

export class CallerAuthorizationError extends Error {
  /** Its SDK error code, so a durable job refused this way reports as denied. */
  public readonly code = "permission_denied";

  constructor(message = "The requester is not permitted") {
    super(message);
    this.name = "CallerAuthorizationError";
  }
}

interface CurrentAuthority {
  permissionLevel: UserPermissionLevel;
  principalId?: string | undefined;
}

function ceiling(
  current: UserPermissionLevel,
  granted: UserPermissionLevel,
): UserPermissionLevel {
  return PermissionService.hasPermission(current, granted) ? granted : current;
}

function accessFor(
  current: CurrentAuthority,
  authority: CallerAuthority,
): CallerAccess {
  const permissionLevel = ceiling(
    current.permissionLevel,
    authority.permissionCeiling,
  );
  return {
    permissionLevel,
    visibilityScope: permissionToVisibilityScope(permissionLevel),
  };
}

/**
 * Records who started durable work and re-resolves that authority when it
 * runs, through current principal resolution and configured grants.
 */
export class CallerAuthorizer {
  private readonly permissions: PermissionService;
  private readonly resolvePrincipal: PrincipalResolver;

  constructor(
    permissions: PermissionService,
    resolvePrincipal: PrincipalResolver,
  ) {
    this.permissions = permissions;
    this.resolvePrincipal = resolvePrincipal;
  }

  /** `unbound` is the level an external caller without an account holds. */
  private async current(
    actor: ActorRef,
    unbound: UserPermissionLevel,
    account: CallerAccountRule,
  ): Promise<CurrentAuthority> {
    if (actor.kind === "service" || actor.kind === "agent") {
      // Existing exact-principal grants/rules provide explicit runtime authority.
      // No configured grant means public, never ambient background admin.
      return {
        permissionLevel: this.permissions.determineUserLevel(
          actor.kind,
          actor.kind === "service" ? actor.serviceId : actor.agentId,
        ),
      };
    }
    const principal = await this.resolvePrincipal(actor);
    if (!principal) {
      if (actor.kind === "external" && account === "optional") {
        return { permissionLevel: unbound };
      }
      throw new CallerAuthorizationError();
    }
    if (actor.kind === "user" && actor.userId !== principal.userId) {
      throw new CallerAuthorizationError();
    }
    return {
      permissionLevel: principal.permissionLevel,
      principalId: principal.userId,
    };
  }

  /** One principal lookup yields both the durable authority and current access. */
  async admit(
    caller: Caller,
    account: CallerAccountRule,
  ): Promise<CallerAdmission> {
    const { actor, permissionLevel } = callerSchema.parse(caller);
    const current = await this.current(actor, permissionLevel, account);
    const authority: CallerAuthority = {
      actor,
      permissionCeiling: ceiling(current.permissionLevel, permissionLevel),
      ...(current.principalId && { principalId: current.principalId }),
    };
    return { authority, access: accessFor(current, authority) };
  }

  /** Current access for a recorded authority; denies a rebound or revoked account. */
  async resolve(
    authority: CallerAuthority,
    account: CallerAccountRule,
  ): Promise<CallerAccess> {
    const current = await this.current(
      authority.actor,
      authority.permissionCeiling,
      account,
    );
    if (current.principalId !== authority.principalId) {
      throw new CallerAuthorizationError();
    }
    return accessFor(current, authority);
  }
}
