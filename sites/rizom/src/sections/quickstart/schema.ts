import { z } from "@brains/utils";

export const QuickstartContentSchema = z.object({
  badge: z.string(),
  headline: z.string(),
  description: z.string(),
  installCommand: z.string(),
  createCommand: z.string(),
  runCommand: z.string(),
  okLines: z.array(z.string()).min(1),
});

export type QuickstartContent = z.infer<typeof QuickstartContentSchema>;
