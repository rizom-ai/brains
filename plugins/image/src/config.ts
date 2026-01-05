import { z } from "zod";

/**
 * Image plugin configuration schema
 */
export const imageConfigSchema = z.object({
  /**
   * Maximum image size in bytes (default: 5MB)
   * Images larger than this will be rejected on upload
   */
  maxSizeBytes: z.number().default(5 * 1024 * 1024),
});

/**
 * Image plugin configuration type (output, with all defaults applied)
 */
export type ImageConfig = z.infer<typeof imageConfigSchema>;

/**
 * Image plugin configuration input type (allows optional fields with defaults)
 */
export type ImageConfigInput = Partial<ImageConfig>;
