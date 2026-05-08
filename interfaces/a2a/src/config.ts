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

  /** Max time to receive outbound A2A POST response headers. */
  requestTimeoutMs: z.number().positive().default(30_000),

  /** Max time between outbound A2A SSE chunks. */
  streamIdleTimeoutMs: z.number().positive().default(60_000),

  /** Network attempts for transient outbound A2A failures. */
  maxNetworkAttempts: z.number().int().positive().default(2),
});

export type A2AConfig = z.infer<typeof a2aConfigSchema>;
