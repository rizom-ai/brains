import { actorRefSchema, type ActorRef } from "@brains/contracts";
import {
  canWriteVisibility,
  getPublishBoundaryState,
  permissionToVisibilityScope,
  type ContentVisibility,
  type IEntityService,
} from "@brains/entity-service";
import {
  PermissionService,
  UserPermissionLevelSchema,
  type Template,
  type UserPermissionLevel,
} from "@brains/templates";
import { z } from "@brains/utils/zod";

/** Supplied by a trusted runtime binding, never by a tool's input schema. */
export interface GenerationCaller {
  actor: ActorRef;
  permissionLevel: UserPermissionLevel;
}

const generationCallerSchema = z.object({
  actor: actorRefSchema,
  permissionLevel: UserPermissionLevelSchema,
});

/** Durable delegation: account binding and an admission-time permission ceiling. */
export interface GenerationAuthority {
  actor: ActorRef;
  permissionCeiling: UserPermissionLevel;
  principalId?: string | undefined;
}

/** Validates the durable payload; runtime-built authorities hold this by construction. */
export const generationAuthoritySchema: z.ZodType<
  GenerationAuthority,
  unknown
> = z
  .object({
    actor: actorRefSchema,
    permissionCeiling: UserPermissionLevelSchema,
    principalId: z.string().min(1).optional(),
  })
  .superRefine((authority, context) => {
    const { actor, principalId } = authority;
    const accountActor = actor.kind === "user" || actor.kind === "external";
    if (
      (accountActor && !principalId) ||
      (!accountActor && principalId !== undefined) ||
      (actor.kind === "user" && actor.userId !== principalId)
    ) {
      context.addIssue({
        code: "custom",
        message: "Invalid generation account binding",
      });
    }
  });

export interface GenerationAccess {
  permissionLevel: UserPermissionLevel;
  visibilityScope: ContentVisibility;
}

export interface GenerationPrincipal {
  userId: string;
  permissionLevel: UserPermissionLevel;
}

/** What one principal lookup establishes: the authority to record and the access it grants now. */
export interface GenerationAdmission {
  authority: GenerationAuthority;
  access: GenerationAccess;
}

export class GenerationAuthorizationError extends Error {
  constructor() {
    super("Content generation is not permitted");
    this.name = "GenerationAuthorizationError";
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
  authority: GenerationAuthority,
): GenerationAccess {
  const permissionLevel = ceiling(
    current.permissionLevel,
    authority.permissionCeiling,
  );
  return {
    permissionLevel,
    visibilityScope: permissionToVisibilityScope(permissionLevel),
  };
}

/** Reuses current principal resolution and the existing entity/template policies. */
export class GenerationAuthorizer {
  private readonly permissions: PermissionService;
  private readonly resolvePrincipal: (
    actor: ActorRef,
  ) => Promise<GenerationPrincipal | null>;

  constructor(
    permissions: PermissionService,
    resolvePrincipal: (actor: ActorRef) => Promise<GenerationPrincipal | null>,
  ) {
    this.permissions = permissions;
    this.resolvePrincipal = resolvePrincipal;
  }

  private async current(actor: ActorRef): Promise<CurrentAuthority> {
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
    if (
      !principal ||
      (actor.kind === "user" && actor.userId !== principal.userId)
    ) {
      throw new GenerationAuthorizationError();
    }
    return {
      permissionLevel: principal.permissionLevel,
      principalId: principal.userId,
    };
  }

  /** One principal lookup yields both the durable authority and current access. */
  async admit(caller: GenerationCaller): Promise<GenerationAdmission> {
    const { actor, permissionLevel } = generationCallerSchema.parse(caller);
    const current = await this.current(actor);
    const authority: GenerationAuthority = {
      actor,
      permissionCeiling: ceiling(current.permissionLevel, permissionLevel),
      ...(current.principalId && { principalId: current.principalId }),
    };
    return { authority, access: accessFor(current, authority) };
  }

  /** Current access for a recorded authority; denies a rebound or revoked account. */
  async resolve(authority: GenerationAuthority): Promise<GenerationAccess> {
    const current = await this.current(authority.actor);
    if (current.principalId !== authority.principalId) {
      throw new GenerationAuthorizationError();
    }
    return accessFor(current, authority);
  }

  assertTarget(
    access: GenerationAccess,
    template: Pick<Template, "requiredPermission"> | undefined,
    entityType: string,
    force: boolean,
    visibility?: ContentVisibility,
  ): void {
    const actions = force
      ? (["create", "update", "publish"] as const)
      : (["create"] as const);
    if (
      (template &&
        !this.permissions.hasPermission(
          access.permissionLevel,
          template.requiredPermission,
        )) ||
      !actions.some((action) =>
        this.permissions.canPerformEntityAction(
          access.permissionLevel,
          entityType,
          action,
        ),
      ) ||
      (visibility && !canWriteVisibility(access.permissionLevel, visibility))
    ) {
      throw new GenerationAuthorizationError();
    }
  }

  assertWrite(
    access: GenerationAccess,
    destination: {
      entityType: string;
      metadata: Record<string, unknown>;
      visibility: ContentVisibility;
    },
    updating: boolean,
    registry: Pick<IEntityService, "getEntityTypeConfig">,
  ): void {
    const published =
      getPublishBoundaryState(
        destination.entityType,
        undefined,
        destination.metadata["status"],
        registry,
      ) !== "non-publish";
    const action = updating ? (published ? "publish" : "update") : "create";
    if (
      !canWriteVisibility(access.permissionLevel, destination.visibility) ||
      !this.permissions.canPerformEntityAction(
        access.permissionLevel,
        destination.entityType,
        action,
      ) ||
      (!updating &&
        published &&
        !this.permissions.canPerformEntityAction(
          access.permissionLevel,
          destination.entityType,
          "publish",
        ))
    ) {
      throw new GenerationAuthorizationError();
    }
  }
}
