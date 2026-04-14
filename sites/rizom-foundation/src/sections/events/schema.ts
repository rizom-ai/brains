import { z } from "@brains/utils";

export const EventItemSchema = z.object({
  num: z.string(),
  city: z.string(),
  description: z.string(),
  date: z.string(),
  anchor: z.string(),
  actionLabel: z.string(),
  href: z.string(),
});

export const EventsContentSchema = z.object({
  kicker: z.string(),
  headline: z.string(),
  subhead: z.string(),
  events: z.array(EventItemSchema).min(1),
  primaryCtaLabel: z.string(),
  primaryCtaHref: z.string(),
  secondaryCtaLabel: z.string(),
  secondaryCtaHref: z.string(),
});

export type EventItem = z.infer<typeof EventItemSchema>;
export type EventsContent = z.infer<typeof EventsContentSchema>;
