import type { JSX } from "preact";
import { cn } from "@brains/ui-library";
import type { RizomBrandSuffix, RizomFooterTagline, RizomLink } from "./types";
import { GUTTER } from "./Section";

const LINK_CLS =
  "text-label-md text-theme-light hover:text-theme transition-colors";

const TOGGLE_CLS =
  "bg-transparent border border-theme-light rounded-md px-2.5 py-1.5 cursor-pointer text-theme-light text-label-md font-body transition-colors hover:text-theme hover:border-theme";

interface FooterProps {
  brandSuffix: RizomBrandSuffix;
  metaLabel: string;
  tagline?: RizomFooterTagline;
  links: RizomLink[];
  className?: string;
}

export const Footer = ({
  brandSuffix,
  metaLabel,
  tagline,
  links,
  className,
}: FooterProps): JSX.Element => (
  <footer
    className={cn(
      `flex flex-col gap-4 ${GUTTER} py-8 md:flex-row md:items-center md:justify-between md:gap-6 md:py-6 border-t border-theme-light text-center md:text-left`,
      className,
    )}
  >
    <div className="flex flex-col items-center gap-1.5 md:items-start max-w-[560px]">
      <div className="flex flex-col items-center gap-1.5 md:flex-row md:items-center md:gap-3">
        <span className="font-nav text-[15px]">
          <span className="font-bold">rizom</span>
          <span className="font-bold text-accent">.</span>
          <span className="text-theme-muted">{brandSuffix}</span>
        </span>
        <span className="text-label-md text-theme-light">{metaLabel}</span>
      </div>
      {tagline ? (
        <p className="text-label-md leading-[1.6] text-theme-light">
          {tagline.prefix ?? ""}
          <a
            href={tagline.link.href}
            className="text-accent hover:opacity-75 transition-opacity"
          >
            {tagline.link.label}
          </a>
          {tagline.suffix ?? ""}
        </p>
      ) : null}
    </div>
    <div className="flex flex-wrap items-center justify-center gap-4 md:justify-end md:gap-6">
      {links.map((link) => (
        <a key={link.href + link.label} href={link.href} className={LINK_CLS}>
          {link.label}
        </a>
      ))}
      <button
        id="themeToggle"
        aria-label="Toggle light mode"
        className={TOGGLE_CLS}
      >
        ☀ Light
      </button>
    </div>
  </footer>
);
