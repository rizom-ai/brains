import type { JSX } from "preact";
import { cn } from "./cn";
import type { RizomBrandSuffix } from "./types";

export interface WordmarkProps {
  /** Brand name before the dot. Defaults to `"rizom"`. */
  name?: string;
  /** Suffix after the dot. Any string (e.g. `"ai"`, `"io"`, `"foundation"`). */
  brandSuffix: RizomBrandSuffix | string;
  className?: string;
  dotClassName?: string;
  suffixClassName?: string;
}

const DOT_BY_SUFFIX: Record<RizomBrandSuffix, string> = {
  work: "text-accent",
  foundation: "text-secondary",
  ai: "text-accent-bright",
};

export const Wordmark = ({
  name = "rizom",
  brandSuffix,
  className,
  dotClassName,
  suffixClassName,
}: WordmarkProps): JSX.Element => {
  const knownDotClass = DOT_BY_SUFFIX[brandSuffix as RizomBrandSuffix];
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-0 font-display font-medium tracking-[-0.015em] [font-variation-settings:'opsz'_24]",
        className,
      )}
    >
      <span className="text-theme">{name}</span>
      <span className={cn(knownDotClass ?? "text-accent", dotClassName)}>
        .
      </span>
      <span
        className={cn("italic font-normal text-theme-muted", suffixClassName)}
      >
        {brandSuffix}
      </span>
    </span>
  );
};
