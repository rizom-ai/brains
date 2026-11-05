import type { AuthMutationContext } from "@brains/contracts";
export function auditActor(context: AuthMutationContext): {
  actorUserId?: string;
} {
  return context.actorUserId ? { actorUserId: context.actorUserId } : {};
}
