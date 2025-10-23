import { z } from "@brains/utils";

export const AboutContentSchema = z.object({
  markdown: z.string(),
});

export type AboutContent = z.infer<typeof AboutContentSchema>;
