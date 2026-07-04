import { z } from "@brains/utils/zod-v4";

/**
 * Portfolio plugin configuration type (output, with all defaults applied)
 */
export type PortfolioConfig = Record<string, unknown>;

/**
 * Portfolio plugin configuration input type (allows optional fields with defaults)
 */
export type PortfolioConfigInput = Record<string, unknown>;

/**
 * Portfolio plugin configuration schema
 */
export const portfolioConfigSchema: z.ZodType<
  PortfolioConfig,
  PortfolioConfigInput
> = z.looseObject({
  // Add portfolio-specific config options here if needed
});
