import { z } from "@brains/utils";

export const IntroContentSchema = z.object({
  tagline: z.string(),
  description: z.string(),
});

export type IntroContent = z.infer<typeof IntroContentSchema>;
