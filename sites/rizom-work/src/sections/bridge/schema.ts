/**
 * Runtime schema/formatter for bridge now live in `src/site-content.ts`.
 * Keep the props type local to the layout so app code does not depend on
 * low-level template authoring primitives here.
 */
export interface BridgeContent {
  kicker: string;
  body: string;
  linkLabel: string;
  linkHref: string;
}
