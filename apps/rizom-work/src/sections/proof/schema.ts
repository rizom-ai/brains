/**
 * Runtime schema/formatter for proof now live in `src/site-content.ts`.
 * Keep the props type local to the layout so app code does not depend on
 * low-level template authoring primitives here.
 */
export interface ProofContent {
  kicker: string;
  headline: string;
  quote: string;
  attribution: string;
  partnersLabel: string;
  partners: string[];
}
