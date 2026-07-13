import { z } from "@brains/utils/zod";

export const AUTH_PRINCIPAL_RESOLVE_CHANNEL = "auth:principal:resolve";

export interface AuthPrincipalResolveRequest {
  actorId: string;
}

export interface AuthPrincipalAttribution {
  userId: string;
  canonicalId?: string | undefined;
  displayName: string;
}

export interface AuthPrincipalResolveResponse {
  principal: AuthPrincipalAttribution | null;
}

export const authPrincipalResolveRequestSchema: z.ZodType<
  AuthPrincipalResolveRequest,
  AuthPrincipalResolveRequest
> = z.object({
  actorId: z.string().min(1),
});

export const authPrincipalAttributionSchema: z.ZodType<
  AuthPrincipalAttribution,
  AuthPrincipalAttribution
> = z.object({
  userId: z.string().min(1),
  canonicalId: z.string().min(1).optional(),
  displayName: z.string().min(1),
});

export const authPrincipalResolveResponseSchema: z.ZodType<
  AuthPrincipalResolveResponse,
  AuthPrincipalResolveResponse
> = z.object({
  principal: authPrincipalAttributionSchema.nullable(),
});
