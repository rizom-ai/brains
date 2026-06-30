/**
 * Runtime schema/formatter for workshop now live in `src/site-content.ts`.
 * Keep the props type local to the layout so app code does not depend on
 * low-level template authoring primitives here.
 */
export interface WorkshopStep {
  num: string;
  label: string;
  title: string;
  body: string;
}

export interface WorkshopContent {
  kicker: string;
  headline: string;
  intro: string;
  steps: WorkshopStep[];
  ctaLabel: string;
  ctaHref: string;
}
