import {
  canWriteVisibility,
  getPublishBoundaryState,
  type ContentVisibility,
  type IEntityService,
} from "@brains/entity-service";
import type { PermissionService, Template } from "@brains/templates";
import type { z } from "@brains/utils/zod";
import {
  CallerAuthorizationError,
  callerAuthoritySchema,
  type Caller,
  type CallerAccess,
  type CallerAdmission,
  type CallerAuthority,
  type CallerAuthorizer,
} from "./caller-authority";

/**
 * Validates the durable payload; runtime-built authorities hold this by
 * construction. Generation writes under an account, so every user or
 * external caller is bound.
 */
export const generationAuthoritySchema: z.ZodType<CallerAuthority, unknown> =
  callerAuthoritySchema.superRefine(({ actor, principalId }, context) => {
    if ((actor.kind === "user" || actor.kind === "external") && !principalId) {
      context.addIssue({
        code: "custom",
        message: "Invalid generation account binding",
      });
    }
  });

/** Durable delegation: account binding and an admission-time permission ceiling. */
export type GenerationAuthority = z.output<typeof generationAuthoritySchema>;

export class GenerationAuthorizationError extends CallerAuthorizationError {
  constructor() {
    super("Content generation is not permitted");
    this.name = "GenerationAuthorizationError";
  }
}

/** A shared refusal is reported as generation's own; anything else is unchanged. */
async function asGenerationRefusal<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    if (error instanceof CallerAuthorizationError) {
      throw new GenerationAuthorizationError();
    }
    throw error;
  }
}

/** Reuses current principal resolution and the existing entity/template policies. */
export class GenerationAuthorizer {
  private readonly permissions: PermissionService;
  private readonly callers: CallerAuthorizer;

  /** `callers` is the runtime's shared requester authorizer. */
  constructor(permissions: PermissionService, callers: CallerAuthorizer) {
    this.permissions = permissions;
    this.callers = callers;
  }

  /** One principal lookup yields both the durable authority and current access. */
  admit(caller: Caller): Promise<CallerAdmission> {
    // Generation writes under an account, so an unbound caller is refused.
    return asGenerationRefusal(this.callers.admit(caller, "required"));
  }

  /** Current access for a recorded authority; denies a rebound or revoked account. */
  resolve(authority: GenerationAuthority): Promise<CallerAccess> {
    return asGenerationRefusal(this.callers.resolve(authority, "required"));
  }

  assertTarget(
    access: CallerAccess,
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
    access: CallerAccess,
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
