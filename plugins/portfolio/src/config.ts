import { z } from "@brains/utils";

/**
 * Portfolio plugin configuration schema
 */
export const portfolioConfigSchema = z.object({
  // Add portfolio-specific config options here if needed
});

/**
 * Portfolio plugin configuration type (output, with all defaults applied)
 */
export type PortfolioConfig = z.infer<typeof portfolioConfigSchema>;

/**
 * Portfolio plugin configuration input type (allows optional fields with defaults)
 */
export type PortfolioConfigInput = Partial<PortfolioConfig>;
