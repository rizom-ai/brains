import type { JSX } from "preact";
import { GUTTER } from "./Section";

const LINK_CLS =
  "text-label-md text-theme-light hover:text-theme transition-colors";

export const Footer = (): JSX.Element => (
  <footer
    className={`flex flex-col md:flex-row items-center justify-between gap-4 md:gap-0 ${GUTTER} py-8 md:py-6 border-t border-theme-light text-center md:text-left`}
  >
    <div className="flex flex-col md:flex-row items-center gap-1.5 md:gap-3">
      <span className="font-nav text-[15px]">
        <span className="font-bold">rizom</span>
        <span className="font-bold text-accent">.</span>
        <span className="text-theme-muted">ai</span>
      </span>
      <span className="text-label-md text-theme-light">
        © 2026 · Apache-2.0
      </span>
    </div>
    <div className="flex flex-wrap justify-center gap-4 md:gap-6">
      <a href="#" className={LINK_CLS}>
        GitHub
      </a>
      <a href="#" className={LINK_CLS}>
        Documentation
      </a>
      <a href="#" className={LINK_CLS}>
        Discord
      </a>
      <a href="#" className={LINK_CLS}>
        LinkedIn
      </a>
      <button
        id="themeToggle"
        aria-label="Toggle light mode"
        className="bg-transparent border border-theme-light rounded-md px-2.5 py-1.5 cursor-pointer text-theme-light text-label-md font-body transition-colors hover:text-theme hover:border-theme"
      >
        ☀ Light
      </button>
    </div>
  </footer>
);
