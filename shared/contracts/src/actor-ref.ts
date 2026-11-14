import { z } from "@brains/utils/zod";
import { sha256Hex } from "@brains/utils/hash";

type ActorRefSchema = z.ZodDiscriminatedUnion<
  [
    z.ZodObject<{
      kind: z.ZodLiteral<"user">;
      userId: z.ZodString;
      canonicalId: z.ZodOptional<z.ZodString>;
    }>,
    z.ZodObject<{
      kind: z.ZodLiteral<"external">;
      externalActorId: z.ZodString;
    }>,
    z.ZodObject<{ kind: z.ZodLiteral<"agent">; agentId: z.ZodString }>,
    z.ZodObject<{ kind: z.ZodLiteral<"service">; serviceId: z.ZodString }>,
  ]
>;

export const actorRefSchema: ActorRefSchema = z.discriminatedUnion("kind", [
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

export type ActorRef = z.output<typeof actorRefSchema>;

export function authenticatedUserId(context: {
  actor?: ActorRef | undefined;
}): string | undefined {
  return context.actor?.kind === "user" ? context.actor.userId : undefined;
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
  const digest = sha256Hex(qualifiedSubject);
  return `ext_${digest}`;
}
