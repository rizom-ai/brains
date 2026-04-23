/**
 * Runtime schema/formatter for closer now live in `src/site-content.ts`.
 * Keep the props type local to the layout so app code does not depend on
 * low-level template authoring primitives here.
 */
export interface CloserContent {
  preamble: string;
  headline: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
}
