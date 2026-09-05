import { z } from "@brains/utils/zod";

export const playbookConfigSchema: z.ZodPipe<
  z.ZodObject<Record<never, never>, z.core.$catchall<z.ZodUnknown>>,
  z.ZodTransform<Record<string, never>, Record<string, unknown>>
> = z
  .object({})
  .catchall(z.unknown())
  .transform((): Record<string, never> => ({}));

export type PlaybookConfig = z.output<typeof playbookConfigSchema>;
export type PlaybookConfigInput = z.input<typeof playbookConfigSchema>;
