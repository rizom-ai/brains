/**
 * Runtime schema/formatter for hero now live in `src/site-content.ts`.
 * Keep the props type local to the layout so app code does not depend on
 * low-level template authoring primitives here.
 */
export interface WorkHeroContent {
  kicker: string;
  headline: string;
  subtitle: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  verdictLabel: string;
  verdictValue: string;
  findingsLabel: string;
  findings: string[];
  diagnosticCtaLabel: string;
  diagnosticCtaHref: string;
}
