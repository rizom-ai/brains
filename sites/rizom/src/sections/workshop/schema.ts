import { z } from "@brains/utils";

export const WorkshopStepSchema = z.object({
  num: z.string(),
  label: z.string(),
  title: z.string(),
  body: z.string(),
});

export const WorkshopContentSchema = z.object({
  kicker: z.string(),
  headline: z.string(),
  intro: z.string(),
  steps: z.array(WorkshopStepSchema).length(3),
  ctaLabel: z.string(),
  ctaHref: z.string(),
});

export type WorkshopStep = z.infer<typeof WorkshopStepSchema>;
export type WorkshopContent = z.infer<typeof WorkshopContentSchema>;
