import { createHash } from "node:crypto";
import { z } from "@brains/utils/zod";

export type ActorRef =
  | {
      kind: "user";
      userId: string;
      canonicalId?: string | undefined;
    }
  | { kind: "external"; externalActorId: string }
  | { kind: "agent"; agentId: string }
  | { kind: "service"; serviceId: string };

export const actorRefSchema: z.ZodType<ActorRef, ActorRef> =
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("user"),
      userId: z.string().min(1),
      canonicalId: z.string().min(1).optional(),
    }),
    z.object({
      kind: z.literal("external"),
      externalActorId: z.string().min(1),
    }),
    z.object({
      kind: z.literal("agent"),
      agentId: z.string().min(1),
    }),
    z.object({
      kind: z.literal("service"),
      serviceId: z.string().min(1),
    }),
  ]);

export interface LegacyActorIdentity {
  actorId: string;
  userId?: string | undefined;
  canonicalId?: string | undefined;
  interfaceType: string;
  role: "user" | "assistant";
}

export function actorRefFromLegacy(input: LegacyActorIdentity): ActorRef {
  const migratedUserId =
    input.userId ??
    (input.canonicalId?.startsWith("user:")
      ? `usr_${input.canonicalId.slice("user:".length)}`
      : undefined);
  if (migratedUserId) {
    return {
      kind: "user",
      userId: migratedUserId,
      ...(input.canonicalId ? { canonicalId: input.canonicalId } : {}),
    };
  }
  if (input.role === "assistant") {
    return { kind: "agent", agentId: input.actorId };
  }
  return {
    kind: "external",
    externalActorId: input.canonicalId
      ? createExternalActorId("canonical", input.canonicalId)
      : createExternalActorId(input.interfaceType, input.actorId),
  };
}

export function actorRefKey(actor: ActorRef): string {
  switch (actor.kind) {
    case "user":
      return `user:${actor.userId}`;
    case "external":
      return `external:${actor.externalActorId}`;
    case "agent":
      return `agent:${actor.agentId}`;
    case "service":
      return `service:${actor.serviceId}`;
  }
}

export function createExternalActorId(source: string, subject: string): string {
  const qualifiedSubject = subject.startsWith(`${source}:`)
    ? subject
    : `${source}:${subject}`;
  const digest = createHash("sha256").update(qualifiedSubject).digest("hex");
  return `ext_${digest}`;
}
