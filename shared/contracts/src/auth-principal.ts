import { z } from "@brains/utils/zod";
import { actorRefSchema, type ActorRef } from "./actor-ref";

export const AUTH_PRINCIPAL_RESOLVE_CHANNEL = "auth:principal:resolve";

export interface AuthPrincipalResolveRequest {
  actor: ActorRef;
}

export interface AuthPrincipalAttribution {
  userId: string;
  personId: string;
  canonicalId?: string | undefined;
  displayName: string;
  permissionLevel: "admin" | "trusted" | "public";
}

export interface AuthPrincipalResolveResponse {
  principal: AuthPrincipalAttribution | null;
}

export const authPrincipalResolveRequestSchema: z.ZodType<
  AuthPrincipalResolveRequest,
  AuthPrincipalResolveRequest
> = z.object({
  actor: actorRefSchema,
});

export const authPrincipalAttributionSchema: z.ZodType<
  AuthPrincipalAttribution,
  AuthPrincipalAttribution
> = z.object({
  userId: z.string().min(1),
  personId: z.string().min(1),
  canonicalId: z.string().min(1).optional(),
  displayName: z.string().min(1),
  permissionLevel: z.enum(["admin", "trusted", "public"]),
});

export const authPrincipalResolveResponseSchema: z.ZodType<
  AuthPrincipalResolveResponse,
  AuthPrincipalResolveResponse
> = z.object({
  principal: authPrincipalAttributionSchema.nullable(),
});
