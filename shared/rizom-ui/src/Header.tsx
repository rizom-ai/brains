import type { JSX } from "preact";
import type { RizomBrandSuffix, RizomLink } from "./types";
import { Wordmark } from "./Wordmark";

const LINK_CLS =
  "hidden md:inline-block font-body text-[15px] text-theme-muted hover:text-theme transition-colors relative py-1 after:content-[''] after:absolute after:left-0 after:bottom-0 after:h-px after:w-0 after:bg-accent after:transition-all after:duration-300 hover:after:w-full";

interface HeaderProps {
  brandSuffix: RizomBrandSuffix;
  navLinks: RizomLink[];
  primaryCta: RizomLink;
}

export const Header = ({
  brandSuffix,
  navLinks,
  primaryCta,
}: HeaderProps): JSX.Element => (
  <nav className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between bg-nav-fade px-6 py-4 backdrop-blur-[8px] md:px-10 md:py-5 xl:px-20">
    <Wordmark brandSuffix={brandSuffix} className="text-[22px]" />
    <div className="flex items-center gap-3 md:gap-8">
      {navLinks.map((link) => (
        <a key={link.href} href={link.href} className={LINK_CLS}>
          {link.label}
        </a>
      ))}
      <a
        href={primaryCta.href}
        className="font-body text-[13px] font-semibold text-theme border border-theme rounded-[8px] px-4 py-2 transition-colors hover:border-accent hover:text-accent md:px-6 md:py-2.5 md:text-[15px]"
      >
        {primaryCta.label}
      </a>
    </div>
  </nav>
);
