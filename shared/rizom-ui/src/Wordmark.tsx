import type { JSX } from "preact";
import { cn } from "./cn";
import type { RizomBrandSuffix } from "./types";

export interface WordmarkProps {
  brandSuffix: RizomBrandSuffix;
  className?: string;
  dotClassName?: string;
}

const DOT_BY_SUFFIX: Record<RizomBrandSuffix, string> = {
  work: "text-accent",
  foundation: "text-secondary",
  ai: "text-accent-bright",
};

export const Wordmark = ({
  brandSuffix,
  className,
  dotClassName,
}: WordmarkProps): JSX.Element => (
  <span
    className={cn(
      "inline-flex items-baseline gap-0 font-display font-medium tracking-[-0.015em] [font-variation-settings:'opsz'_24]",
      className,
    )}
  >
    <span className="text-theme">rizom</span>
    <span className={cn(DOT_BY_SUFFIX[brandSuffix], dotClassName)}>.</span>
    <span className="italic font-normal text-theme-muted">{brandSuffix}</span>
  </span>
);
