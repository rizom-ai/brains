import { z } from "@brains/utils";

export const IntroContentSchema = z.object({
  tagline: z.string(),
  description: z.string(),
  features: z
    .array(
      z.object({
        icon: z.string(), // Lucide icon name
        title: z.string(),
        description: z.string(),
      }),
    )
    .optional(),
});

export type IntroContent = z.infer<typeof IntroContentSchema>;
