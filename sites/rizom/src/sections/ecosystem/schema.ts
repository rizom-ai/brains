import { z } from "@brains/utils";

export const EcosystemCardSchema = z.object({
  /** Domain suffix shown after `rizom.` (e.g. "ai", "foundation", "work"). */
  suffix: z.string(),
  title: z.string(),
  body: z.string(),
  linkLabel: z.string(),
  linkHref: z.string(),
  /**
   * If true, render this card with the highlighted (amber) treatment
   * and replace the link with "You are here". Each app's seed content
   * marks one card as active.
   */
  active: z.boolean(),
  /**
   * Color family for the link + accent bar gradient. "amber" matches
   * the rizom.ai card; "secondary" (purple) matches foundation/work.
   */
  accent: z.enum(["amber", "secondary"]),
});

export const EcosystemContentSchema = z.object({
  cards: z.array(EcosystemCardSchema).min(1),
});

export type EcosystemCard = z.infer<typeof EcosystemCardSchema>;
export type EcosystemContent = z.infer<typeof EcosystemContentSchema>;
