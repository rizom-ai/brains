import { z } from "@brains/utils/zod-v4";

export type PlaybookConfig = Record<string, never>;
export type PlaybookConfigInput = Record<string, unknown>;

export const playbookConfigSchema: z.ZodType<
  PlaybookConfig,
  PlaybookConfigInput
> = z
  .object({})
  .catchall(z.unknown())
  .transform((): PlaybookConfig => ({}));
