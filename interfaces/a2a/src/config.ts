import { z } from "@brains/utils/zod";
import { publicAsksConfigSchema } from "./public-asks";

type A2AConfigSchema = z.ZodObject<
  {
    port: z.ZodOptional<z.ZodNever>;
    organization: z.ZodOptional<z.ZodString>;
    requestTimeoutMs: z.ZodDefault<z.ZodNumber>;
    streamIdleTimeoutMs: z.ZodDefault<z.ZodNumber>;
    maxNetworkAttempts: z.ZodDefault<z.ZodNumber>;
    networkAskTimeoutMs: z.ZodDefault<z.ZodNumber>;
    publicAsks: z.ZodPrefault<typeof publicAsksConfigSchema>;
    trustedTokens: z.ZodOptional<z.ZodNever>;
    outboundTokens: z.ZodOptional<z.ZodNever>;
  },
  z.core.$strict
>;

/**
 * A2A interface configuration schema
 */
export const a2aConfigSchema: A2AConfigSchema = z
  .object({
    /**
     * Removed: A2A is mounted on the brain's own web server and never opened
     * a port of its own. A configuration that still sets it is refused with
     * what to do.
     */
    port: z
      .never({
        error:
          "port is no longer supported: A2A is served by the brain's own web server; remove this setting",
      })
      .optional(),

    /** Organization name for the Agent Card provider field */
    organization: z.string().optional(),

    /** Max time to receive outbound A2A POST response headers. */
    requestTimeoutMs: z.number().positive().default(30_000),

    /** Max time between outbound A2A SSE chunks. */
    streamIdleTimeoutMs: z.number().positive().default(60_000),

    /** Network attempts for transient outbound A2A failures. */
    maxNetworkAttempts: z.number().int().positive().default(2),

    /**
     * The whole budget for one peer when the network is asked: Agent Card
     * fetch and answer. A brain's answer is a model turn with retrieval, which
     * takes 15–25 s on the fleet, so a short budget asks nobody in effect.
     */
    networkAskTimeoutMs: z.number().positive().default(30_000),

    /** How much this brain answers public A2A callers per day, and whether at all. */
    publicAsks: publicAsksConfigSchema.prefault({}),

    /**
     * Removed with signed A2A trust: a configuration that still sets either
     * is refused with what to do instead of an unknown-key error.
     */
    trustedTokens: z
      .never({ error: "trustedTokens legacy config is no longer supported" })
      .optional(),
    outboundTokens: z
      .never({ error: "outboundTokens legacy config is no longer supported" })
      .optional(),
  })
  .strict();

export type A2AConfig = z.output<typeof a2aConfigSchema>;
export type A2AConfigInput = z.input<typeof a2aConfigSchema>;
