/** @jsxImportSource react */
import type { JSX, ReactNode } from "react";
import { RizomFrame, type RizomLayoutProps } from "./rizom";
import { StoryPage, type StoryFigure } from "./story/story-page";
import { brainOrganism } from "./story/brain-organism";
import { foundationOrganism } from "./story/foundation-organism";
import { livingOrganism } from "./story/living-organism";
import { workOrganism } from "./story/work-organism";

/**
 * rizom.ai's chrome: one bar (the wordmark, the rooms and the archive, the
 * theme toggle and one call to action), the page in its room's light, and
 * one footer. A story page renders its sections as chapters beside its
 * drawing, with the reading thread down the left edge (see ./story).
 */

type Room = "brain" | "work" | "foundation";

interface BarLink {
  label: string;
  href: string;
  room?: Room;
}

// The rooms keep their own light: brass for the platform, ruby for the
// practice, moss for the research. Writing is the archive.
const BAR_LINKS: BarLink[] = [
  { label: "Brain", href: "/brain", room: "brain" },
  { label: "Work", href: "/work", room: "work" },
  { label: "Foundation", href: "/foundation", room: "foundation" },
  { label: "Writing", href: "/writing" },
];

const AUDIT = { label: "Book an audit", href: "/work#audit" };

// The active room drives the accent (data-room). Home and the archive wear
// brass, the theme's default.
function activeRoom(path: string): Room {
  if (path === "/work" || path.startsWith("/work/")) return "work";
  if (path === "/foundation" || path.startsWith("/foundation/")) {
    return "foundation";
  }
  return "brain";
}

function isCurrent(path: string, href: string): boolean {
  return path === href || path.startsWith(`${href}/`);
}

function Bar({ path }: { path: string }): JSX.Element {
  return (
    <header className="bar sticky top-0 z-[100] border-b border-theme-light bg-nav-fade backdrop-blur-[12px]">
      <div className="bar__inner shell mx-auto flex h-[4.6rem] max-w-[80rem] items-center gap-4 px-4 sm:gap-8 sm:px-6 md:px-10 xl:px-20">
        <a
          href="/"
          className="wordmark font-display text-[clamp(22px,5.5vw,26px)] font-semibold tracking-[-0.01em] [font-variation-settings:'SOFT'_100]"
          aria-label="Rizom home"
        >
          <span className="text-theme">rizom</span>
          <span className="text-accent">.</span>
        </a>
        {/* Below sm the footer carries every link; the row keeps the
            wordmark, the toggle and the call to action. */}
        <nav
          className="bar__nav hidden items-center gap-6 sm:flex"
          aria-label="Site"
        >
          {BAR_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`bar__link font-body text-[16px] transition-colors hover:text-theme${isCurrent(path, link.href) ? " text-theme" : " text-theme-light"}`}
              data-room={link.room}
              {...(isCurrent(path, link.href)
                ? { "aria-current": "page" as const }
                : {})}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex-1" />
        {/* boot.js binds by id and syncs the label; window.toggleTheme
            (injected by site-engine) flips data-theme + persists it. */}
        <button
          id="themeToggle"
          type="button"
          aria-label="Toggle color theme"
          className="cursor-pointer font-label text-label-xs uppercase tracking-[0.12em] text-theme-light transition-colors hover:text-theme"
        >
          ☀ Light
        </button>
        <a
          href={AUDIT.href}
          className="button self-center whitespace-nowrap rounded-[3px] bg-accent px-3.5 py-2 font-body text-[15px] font-medium text-theme-inverse transition-[filter,transform] hover:brightness-110 hover:-translate-y-px sm:px-[18px] sm:py-[9px] sm:text-[16px]"
        >
          {AUDIT.label}
        </a>
      </div>
    </header>
  );
}

/* The site-info entity always carries a copyright, but the framework
   fills an empty one with this placeholder. Treat it as "unset" so the
   footer shows a real signature or nothing — never filler. */
const COPYRIGHT_FALLBACK = "Powered by Rizom";

function signature(siteInfo: RizomLayoutProps["siteInfo"]): string | null {
  const value = siteInfo.copyright.trim();
  return value && value !== COPYRIGHT_FALLBACK ? value : null;
}

interface FooterColumn {
  heading: string;
  links: { label: string; href: string }[];
}

/* The site footer: three columns plus the legal row, on every page. */
const FOOTER_COLUMNS: FooterColumn[] = [
  {
    heading: "The brain",
    links: [
      { label: "Get started", href: "/brain#quickstart" },
      { label: "Documentation ↗", href: "https://docs.rizom.ai" },
      { label: "GitHub ↗", href: "https://github.com/rizom-ai" },
    ],
  },
  {
    heading: "The practice",
    links: [
      { label: "The Knowledge Audit", href: "/work#audit" },
      { label: "Team Type quiz", href: "/work#quiz" },
      { label: "Contact", href: "/work#contact" },
    ],
  },
  {
    heading: "The foundation",
    links: [
      { label: "Manifesto", href: "/foundation" },
      { label: "Writing", href: "/writing" },
      { label: "Events", href: "/foundation#events" },
      { label: "Support", href: "/foundation#support" },
    ],
  },
];

function SiteFooter({
  siteInfo,
}: {
  siteInfo: RizomLayoutProps["siteInfo"];
}): JSX.Element {
  return (
    <footer className="site-footer footer-grid relative z-[1] grid gap-10 border-t border-theme px-4 pt-11 pb-[38px] sm:grid-cols-2 sm:px-6 md:px-10 lg:grid-cols-[1.3fr_1fr_1fr_1fr] xl:px-20">
      <div className="footer-brand">
        <a
          href="/"
          className="wordmark font-display text-[30px] font-semibold tracking-[-0.01em] [font-variation-settings:'SOFT'_100]"
        >
          <span className="text-theme">rizom</span>
          <span className="text-accent">.</span>
        </a>
        <p className="mt-2.5 max-w-[26ch] font-body text-[13.5px] text-theme-light">
          {siteInfo.description}
        </p>
      </div>
      {FOOTER_COLUMNS.map((column) => (
        <div className="footer-col" key={column.heading}>
          <div className="small-label mb-3 font-label text-[11px] uppercase tracking-[0.18em] text-theme-light">
            {column.heading}
          </div>
          {column.links.map((link) => (
            <a
              key={link.href + link.label}
              href={link.href}
              className="block py-1.5 font-body text-[15.5px] text-theme-light no-underline transition-colors hover:text-theme"
            >
              {link.label}
            </a>
          ))}
        </div>
      ))}
      <div className="footer-base col-span-full mt-2 flex flex-wrap items-center gap-x-[22px] gap-y-2 border-t border-theme-light pt-4 font-label text-[11.5px] text-theme-light">
        {signature(siteInfo) && <span>{signature(siteInfo)}</span>}
      </div>
    </footer>
  );
}

// The pages told as a story, and the drawing each one scrolls beside.
const STORY_FIGURES: Record<string, StoryFigure> = {
  "/": { className: "living-org", organism: livingOrganism },
  "/brain": { className: "brain-org", organism: brainOrganism },
  "/work": { className: "work-org", organism: workOrganism },
  "/foundation": { className: "foundation-org", organism: foundationOrganism },
};

function RizomAiChrome({
  path,
  siteInfo,
  children,
}: {
  path: string;
  siteInfo: RizomLayoutProps["siteInfo"];
  children: ReactNode;
}): JSX.Element {
  const room = activeRoom(path);
  const figure = STORY_FIGURES[path];
  return (
    <RizomFrame>
      <div data-room={room} className="relative">
        <Bar path={path} />
        <main>
          {figure ? (
            <StoryPage figure={figure}>{children}</StoryPage>
          ) : (
            children
          )}
        </main>
        <SiteFooter siteInfo={siteInfo} />
      </div>
    </RizomFrame>
  );
}

export const AiLayout = ({
  sections,
  path,
  siteInfo,
}: RizomLayoutProps): JSX.Element => (
  <RizomAiChrome path={path} siteInfo={siteInfo}>
    {sections}
  </RizomAiChrome>
);
