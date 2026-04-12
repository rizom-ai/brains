import { z } from "@brains/utils";

export const SupportCardSchema = z.object({
  tone: z.enum(["amber", "purple"]),
  label: z.string(),
  headline: z.string(),
  body: z.string(),
  linkLabel: z.string(),
  linkHref: z.string(),
});

export const SupportContentSchema = z.object({
  kicker: z.string(),
  headline: z.string(),
  cards: z.array(SupportCardSchema).length(2),
});

export type SupportCard = z.infer<typeof SupportCardSchema>;
export type SupportContent = z.infer<typeof SupportContentSchema>;
