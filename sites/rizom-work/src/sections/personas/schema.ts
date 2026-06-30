/**
 * Runtime schema/formatter for personas now live in `src/site-content.ts`.
 * Keep the props type local to the layout so app code does not depend on
 * low-level template authoring primitives here.
 */
export interface PersonaCard {
  label: string;
  quote: string;
  body: string;
}

export interface PersonasContent {
  kicker: string;
  headline: string;
  cards: PersonaCard[];
}
