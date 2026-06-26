import { z } from "@brains/utils/zod-v4";

/**
 * Portfolio plugin configuration schema
 */
export const portfolioConfigSchema = z.looseObject({
  // Add portfolio-specific config options here if needed
});

/**
 * Portfolio plugin configuration type (output, with all defaults applied)
 */
export type PortfolioConfig = z.output<typeof portfolioConfigSchema>;

/**
 * Portfolio plugin configuration input type (allows optional fields with defaults)
 */
export type PortfolioConfigInput = z.input<typeof portfolioConfigSchema>;
