/**
 * Runtime schema/formatter for hero now live in `src/site-content.ts`.
 * Keep the props type local to the layout so app code does not depend on
 * low-level template authoring primitives here.
 */
export interface HeroContent {
  headline: string;
  subhead: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
}
