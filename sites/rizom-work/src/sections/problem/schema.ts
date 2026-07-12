/**
 * Runtime schema/formatter for problem now live in `src/site-content.ts`.
 * Keep the props type local to the layout so app code does not depend on
 * low-level template authoring primitives here.
 */
export interface WorkProblemContent {
  kicker: string;
  headline: string;
  subhead: string;
}
