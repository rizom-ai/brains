import { z } from "@brains/utils/zod";

/**
 * The portfolio package's settings: none of its own. A brain config naming
 * any stays valid, as the portfolio plugin class took any.
 */
export const portfolioConfigSchema: z.ZodObject<
  Record<string, never>,
  z.core.$loose
> = z.looseObject({});

/** Portfolio plugin configuration type (output, with all defaults applied) */
export type PortfolioConfig = z.output<typeof portfolioConfigSchema>;

/** Portfolio plugin configuration input type */
export type PortfolioConfigInput = z.input<typeof portfolioConfigSchema>;
