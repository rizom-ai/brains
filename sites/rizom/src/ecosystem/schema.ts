import { z } from "@brains/utils";

/**
 * Which sibling rizom site a card represents. Drives the visual
 * identity (link color, top accent bar, hover glow) end-to-end —
 * the layout derives everything from this single field.
 */
export const EcosystemSuffixSchema = z.enum(["ai", "foundation", "work"]);
export type EcosystemSuffix = z.infer<typeof EcosystemSuffixSchema>;

export const EcosystemCardSchema = z.object({
  suffix: EcosystemSuffixSchema,
  title: z.string(),
  body: z.string(),
  linkLabel: z.string(),
  linkHref: z.string(),
});

export const EcosystemContentSchema = z.object({
  /**
   * Short tracked-caps label rendered above the headline — matches the
   * Badge used by other sections. Forces the ecosystem reveal to be
   * framed deliberately instead of appearing as an unlabeled footer.
   */
  eyebrow: z.string(),
  /**
   * Section headline rendered above the card grid.
   */
  headline: z.string(),
  cards: z.array(EcosystemCardSchema).min(1),
});

export type EcosystemCard = z.infer<typeof EcosystemCardSchema>;
export type EcosystemContent = z.infer<typeof EcosystemContentSchema>;
