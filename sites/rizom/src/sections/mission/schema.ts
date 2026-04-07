import { z } from "@brains/utils";

export const MissionContentSchema = z.object({
  preamble: z.string(),
  headlineStart: z.string(),
  headlineHighlight: z.string(),
  post: z.string(),
  primaryCtaLabel: z.string(),
  primaryCtaHref: z.string(),
  secondaryCtaLabel: z.string(),
  secondaryCtaHref: z.string(),
});

export type MissionContent = z.infer<typeof MissionContentSchema>;
