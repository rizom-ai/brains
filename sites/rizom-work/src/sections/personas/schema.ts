import { z } from "@brains/utils";

export const PersonaCardSchema = z.object({
  label: z.string(),
  quote: z.string(),
  body: z.string(),
});

export const PersonasContentSchema = z.object({
  kicker: z.string(),
  headline: z.string(),
  cards: z.array(PersonaCardSchema).min(1),
});

export type PersonaCard = z.infer<typeof PersonaCardSchema>;
export type PersonasContent = z.infer<typeof PersonasContentSchema>;
