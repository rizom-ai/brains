import { z } from "@brains/utils/zod";

type A2AConfigSchema = z.ZodObject<
  {
    port: z.ZodDefault<z.ZodNumber>;
    organization: z.ZodOptional<z.ZodString>;
    requestTimeoutMs: z.ZodDefault<z.ZodNumber>;
    streamIdleTimeoutMs: z.ZodDefault<z.ZodNumber>;
    maxNetworkAttempts: z.ZodDefault<z.ZodNumber>;
  },
  z.core.$strict
>;

/**
 * A2A interface configuration schema
 */
export const a2aConfigSchema: A2AConfigSchema = z
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

export type A2AConfig = z.output<typeof a2aConfigSchema>;
export type A2AConfigInput = z.input<typeof a2aConfigSchema>;
