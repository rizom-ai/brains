export interface AuthMutationContext {
  /** Authenticated user performing the mutation, for audit attribution. */
  actorUserId?: string;
}

export function auditActor(context: AuthMutationContext): {
  actorUserId?: string;
} {
  return context.actorUserId ? { actorUserId: context.actorUserId } : {};
}
