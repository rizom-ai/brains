import { z } from "@brains/utils/zod-v4";

export const playbookConfigSchema = z
  .object({})
  .catchall(z.unknown())
  .transform(() => ({}));

export type PlaybookConfig = z.output<typeof playbookConfigSchema>;
export type PlaybookConfigInput = z.input<typeof playbookConfigSchema>;
