import { z } from "@brains/utils";

/**
 * A2A interface configuration schema
 */
export const a2aConfigSchema = z.object({
  /** Port for the A2A HTTP server */
  port: z.number().default(3334),

  /** Organization name for the Agent Card provider field */
  organization: z.string().optional(),

  /** Inbound: map of bearer token → agent identity for caller authentication */
  trustedTokens: z.record(z.string()).optional(),

  /** Outbound: map of remote agent domain → bearer token to send */
  outboundTokens: z.record(z.string()).optional(),
});

export type A2AConfig = z.infer<typeof a2aConfigSchema>;
