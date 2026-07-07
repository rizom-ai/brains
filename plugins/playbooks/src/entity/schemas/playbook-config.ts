import { z } from "@brains/utils/zod";

export type PlaybookConfig = Record<string, never>;
export type PlaybookConfigInput = Record<string, unknown>;

export const playbookConfigSchema: z.ZodType<
  PlaybookConfig,
  PlaybookConfigInput
> = z
  .object({})
  .catchall(z.unknown())
  .transform((): PlaybookConfig => ({}));
