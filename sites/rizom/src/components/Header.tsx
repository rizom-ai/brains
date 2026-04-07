import type { JSX } from "preact";

const LINK_CLS =
  "hidden md:inline-block font-body text-body-sm text-theme-muted hover:text-theme transition-colors relative py-1 after:content-[''] after:absolute after:left-0 after:bottom-0 after:h-px after:w-0 after:bg-accent after:transition-all hover:after:w-full";

export const Header = (): JSX.Element => (
  <nav className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-6 py-4 md:px-10 lg:px-20 lg:py-5 bg-nav-fade backdrop-blur-[8px]">
    <div className="flex items-center font-nav text-[20px]">
      <span className="font-bold text-theme">rizom</span>
      <span className="font-bold text-accent">.</span>
      <span className="text-theme-muted">ai</span>
    </div>
    <div className="flex items-center gap-3 md:gap-8">
      <a href="#problem" className={LINK_CLS}>
        Platform
      </a>
      <a href="#quickstart" className={LINK_CLS}>
        Docs
      </a>
      <a href="#ecosystem" className={LINK_CLS}>
        Network
      </a>
      <a
        href="#quickstart"
        className="font-body text-label-md md:text-body-sm font-semibold text-theme border border-theme rounded-lg px-4 py-2 md:px-6 md:py-2.5 transition-colors hover:border-accent hover:text-accent"
      >
        Get Started
      </a>
    </div>
  </nav>
);
