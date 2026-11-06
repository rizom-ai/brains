import { z } from "@brains/utils/zod";
import { actorRefSchema } from "./actor-ref";
import { defineBusContract, type BusContract } from "./bus-contract";

type AuthPrincipalResolveRequestSchema = z.ZodObject<{
  actor: typeof actorRefSchema;
}>;

export const authPrincipalResolveRequestSchema: AuthPrincipalResolveRequestSchema =
  z.object({
    actor: actorRefSchema,
  });

export type AuthPrincipalResolveRequest = z.output<
  typeof authPrincipalResolveRequestSchema
>;

type AuthPrincipalAttributionSchema = z.ZodObject<{
  userId: z.ZodString;
  personId: z.ZodString;
  canonicalId: z.ZodOptional<z.ZodString>;
  displayName: z.ZodString;
  permissionLevel: z.ZodEnum<{
    admin: "admin";
    trusted: "trusted";
    public: "public";
  }>;
}>;

export const authPrincipalAttributionSchema: AuthPrincipalAttributionSchema =
  z.object({
    userId: z.string().min(1),
    personId: z.string().min(1),
    canonicalId: z.string().min(1).optional(),
    displayName: z.string().min(1),
    permissionLevel: z.enum(["admin", "trusted", "public"]),
  });

export type AuthPrincipalAttribution = z.output<
  typeof authPrincipalAttributionSchema
>;

type AuthPrincipalResolveResponseSchema = z.ZodObject<{
  principal: z.ZodNullable<AuthPrincipalAttributionSchema>;
}>;

export const authPrincipalResolveResponseSchema: AuthPrincipalResolveResponseSchema =
  z.object({
    principal: authPrincipalAttributionSchema.nullable(),
  });

export type AuthPrincipalResolveResponse = z.output<
  typeof authPrincipalResolveResponseSchema
>;

/** Resolve an actor to the auth principal behind it; auth-service owns it. */
export const authPrincipalResolveContract: BusContract<
  AuthPrincipalResolveRequestSchema,
  AuthPrincipalResolveResponseSchema,
  "request"
> = defineBusContract({
  channel: "auth:principal:resolve",
  request: authPrincipalResolveRequestSchema,
  response: authPrincipalResolveResponseSchema,
  delivery: "request",
});
