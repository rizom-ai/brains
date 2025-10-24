import type { JSX } from "preact";
import type { FooterCTAContent } from "./schema";
import { FooterCTA } from "../footer-cta";

/**
 * Footer CTA section - can be added to any page
 */
export const FooterCTALayout = (content: FooterCTAContent): JSX.Element => {
  return <FooterCTA {...content} />;
};
