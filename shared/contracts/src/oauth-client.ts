import { z } from "@brains/utils/zod";

/**
 * A confidential OAuth client that a plugin registers under an id and secret
 * it chooses, such as a homeserver that signs people in with the brain.
 *
 * Ids are lowercase words joined by hyphens, so they never take the shape of
 * a dynamically registered id (`oc_…`) or a client ID metadata document URL.
 */
/**
 * The identity a sign-in through the client proves: a claim of a channel
 * type whose subject is the person's username between a prefix and a suffix,
 * such as a homeserver's `@<username>:<server>`.
 */
export const oauthClientIdentityClaimSchema: z.ZodObject<{
  type: z.ZodString;
  subjectPrefix: z.ZodDefault<z.ZodString>;
  subjectSuffix: z.ZodDefault<z.ZodString>;
}> = z.object({
  type: z.string().regex(/^[a-z][a-z0-9-]*$/),
  subjectPrefix: z.string().max(32).default(""),
  subjectSuffix: z.string().max(255).default(""),
});

export type OAuthClientIdentityClaim = z.output<
  typeof oauthClientIdentityClaimSchema
>;

export const provisionOAuthClientInputSchema: z.ZodObject<{
  clientId: z.ZodString;
  clientSecret: z.ZodString;
  clientName: z.ZodString;
  redirectUris: z.ZodArray<z.ZodURL>;
  identityClaim: z.ZodOptional<typeof oauthClientIdentityClaimSchema>;
}> = z.object({
  clientId: z
    .string()
    .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/)
    .min(3)
    .max(64),
  clientSecret: z.string().min(32).max(512),
  clientName: z.string().trim().min(1).max(200),
  redirectUris: z.array(z.url()).min(1).max(10),
  identityClaim: oauthClientIdentityClaimSchema.optional(),
});

export type ProvisionOAuthClientInput = z.input<
  typeof provisionOAuthClientInputSchema
>;
