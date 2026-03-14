import { z } from "@brains/utils";

/**
 * A2A interface configuration schema
 */
export const a2aConfigSchema = z.object({
  /** Port for the A2A HTTP server */
  port: z.number().default(3334),

  /** Bearer token for authenticating incoming requests */
  authToken: z.string().optional(),

  /** Domain this brain is served at (used in Agent Card URL) */
  domain: z.string().optional(),

  /** Organization name for the Agent Card provider field */
  organization: z.string().optional(),
});

export type A2AConfig = z.infer<typeof a2aConfigSchema>;
