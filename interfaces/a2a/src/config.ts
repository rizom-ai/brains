import { z } from "@brains/utils/zod";

export interface A2AConfig {
  port: number;
  organization?: string | undefined;
  requestTimeoutMs: number;
  streamIdleTimeoutMs: number;
  maxNetworkAttempts: number;
}

export interface A2AConfigInput {
  port?: number | undefined;
  organization?: string | undefined;
  requestTimeoutMs?: number | undefined;
  streamIdleTimeoutMs?: number | undefined;
  maxNetworkAttempts?: number | undefined;
}

/**
 * A2A interface configuration schema
 */
export const a2aConfigSchema: z.ZodType<A2AConfig, A2AConfigInput> = z
  .object({
    /** Port for the A2A HTTP server */
    port: z.number().default(3334),

    /** Organization name for the Agent Card provider field */
    organization: z.string().optional(),

    /** Max time to receive outbound A2A POST response headers. */
    requestTimeoutMs: z.number().positive().default(30_000),

    /** Max time between outbound A2A SSE chunks. */
    streamIdleTimeoutMs: z.number().positive().default(60_000),

    /** Network attempts for transient outbound A2A failures. */
    maxNetworkAttempts: z.number().int().positive().default(2),
  })
  .strict();
