import type { JSX } from "preact";
import type { RizomBrandSuffix, RizomFooterTagline, RizomLink } from "./types";
import { GUTTER } from "./Section";

const LINK_CLS =
  "text-label-md text-theme-light hover:text-theme transition-colors";

interface FooterProps {
  brandSuffix: RizomBrandSuffix;
  metaLabel: string;
  tagline?: RizomFooterTagline;
  links: RizomLink[];
}

export const Footer = ({
  brandSuffix,
  metaLabel,
  tagline,
  links,
}: FooterProps): JSX.Element => (
  <footer
    className={`flex flex-col md:grid md:grid-cols-3 md:items-center gap-5 md:gap-8 ${GUTTER} py-8 md:py-6 border-t border-theme-light text-center md:text-left`}
  >
    <div className="flex flex-col items-center md:items-start gap-3 max-w-[480px] md:justify-self-start">
      <div className="flex flex-row items-center justify-center md:justify-start gap-1.5 md:gap-3">
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
    <div className="flex justify-center md:justify-self-center">
      <button
        id="themeToggle"
        aria-label="Toggle light mode"
        className="bg-transparent border border-theme-light rounded-md px-2.5 py-1.5 cursor-pointer text-theme-light text-label-md font-body transition-colors hover:text-theme hover:border-theme"
      >
        ☀ Light
      </button>
    </div>
    <div className="flex flex-wrap justify-center md:justify-end gap-4 md:gap-6 md:justify-self-end">
      {links.map((link) => (
        <a key={link.href + link.label} href={link.href} className={LINK_CLS}>
          {link.label}
        </a>
      ))}
    </div>
  </footer>
);
