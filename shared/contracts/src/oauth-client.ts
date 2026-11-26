import { z } from "@brains/utils/zod";

/**
 * A confidential OAuth client that a plugin registers under an id and secret
 * it chooses, such as a homeserver that signs people in with the brain.
 *
 * Ids are lowercase words joined by hyphens, so they never take the shape of
 * a dynamically registered id (`oc_…`) or a client ID metadata document URL.
 */
export const provisionOAuthClientInputSchema: z.ZodObject<{
  clientId: z.ZodString;
  clientSecret: z.ZodString;
  clientName: z.ZodString;
  redirectUris: z.ZodArray<z.ZodURL>;
}> = z.object({
  clientId: z
    .string()
    .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/)
    .min(3)
    .max(64),
  clientSecret: z.string().min(32).max(512),
  clientName: z.string().trim().min(1).max(200),
  redirectUris: z.array(z.url()).min(1).max(10),
});

export type ProvisionOAuthClientInput = z.output<
  typeof provisionOAuthClientInputSchema
>;
