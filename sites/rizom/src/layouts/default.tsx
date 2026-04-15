import type { JSX } from "preact";
import { RizomFrame, type RizomLayoutProps } from "./frame";

/**
 * Neutral fallback layout for direct consumers of @brains/site-rizom.
 *
 * Wrapper site packages own the real Rizom shell chrome. The shared
 * package keeps only a minimal canvas-backed page frame so it no longer
 * defaults to the AI app shell.
 */
export const DefaultLayout = ({ sections }: RizomLayoutProps): JSX.Element => (
  <RizomFrame>
    <main>{sections}</main>
  </RizomFrame>
);
