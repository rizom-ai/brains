/** @jsxImportSource react */
import type { JSX, ReactNode } from "react";
import { RizomFrame, type RizomLayoutProps } from "./rizom";
import { StoryPage, type StoryFigure } from "./story/story-page";

/**
 * A Rizom site's chrome: one bar (the wordmark, the site's links, the theme
 * toggle and one call to action), the page in its room's light, and one
 * footer. A story page renders its sections as chapters beside its drawing,
 * with the reading thread down the left edge (see ./story).
 *
 * One of the three sites (rizom.ai, rizom.work, rizom.foundation) also names
 * the three above its bar and carries its domain in the wordmark.
 */

export type Room = "brain" | "work" | "foundation";
export type RizomSite = "ai" | "work" | "foundation";

export interface SiteBarLink {
  label: string;
  href: string;
  room?: Room;
}

export interface SiteCta {
  label: string;
  /** One word for the bar on a phone, where the full label does not fit. */
  short?: string;
  href: string;
}

export interface SiteFooterColumn {
  heading: string;
  links: { label: string; href: string }[];
}

export interface SiteLayoutOptions {
  /** One of the three sites: adds the strip above the bar and the domain in the wordmark. */
  site?: RizomSite;
  /** The light the page wears (data-room): fixed, or by path. */
  room: Room | ((path: string) => Room);
  barLinks: SiteBarLink[];
  cta: SiteCta;
  footerColumns: SiteFooterColumn[];
  /** A line beside the copyright. */
  footerNote?: string;
  /** The pages told as a story, and the drawing each scrolls beside; null for a page that brings its own. */
  figures: Record<string, StoryFigure | null>;
}

const SITES: { site: RizomSite; room: Room; origin: string }[] = [
  { site: "ai", room: "brain", origin: "https://rizom.ai" },
  { site: "work", room: "work", origin: "https://rizom.work" },
  {
    site: "foundation",
    room: "foundation",
    origin: "https://rizom.foundation",
  },
];

// What each site's column links to: a path on that site, or a full address.
const SITE_LINKS: Record<RizomSite, { label: string; href: string }[]> = {
  ai: [
    { label: "The Brain", href: "/brain" },
    { label: "Documentation ↗", href: "https://docs.rizom.ai" },
    { label: "Ask the network", href: "/ask" },
    { label: "GitHub ↗", href: "https://github.com/rizom-ai" },
  ],
  work: [
    { label: "For hubs", href: "/#hubs" },
    { label: "For teams", href: "/#teams" },
    { label: "Partners", href: "/#partners" },
    { label: "Talk to us", href: "/contact" },
  ],
  foundation: [
    { label: "Common Sense", href: "/common-sense" },
    { label: "Members' writing", href: "/#writing" },
    { label: "Events", href: "/#events" },
    { label: "Founding supporters", href: "/support" },
    { label: "The board", href: "/#board" },
  ],
};

/** The footer of one of the three sites: a column per site, its own links on this site and the others' on theirs. */
export function threeSiteFooter(current: RizomSite): SiteFooterColumn[] {
  return SITES.map(({ site, origin }) => ({
    heading: `rizom.${site}`,
    links: SITE_LINKS[site].map((link) => ({
      label: link.label,
      href:
        site === current || !link.href.startsWith("/")
          ? link.href
          : `${origin}${link.href === "/" ? "" : link.href}`,
    })),
  }));
}

function isCurrent(path: string, href: string): boolean {
  return path === href || path.startsWith(`${href}/`);
}

function Strip({ site }: { site: RizomSite }): JSX.Element {
  return (
    <nav
      aria-label="Rizom sites"
      className="sites-strip border-b border-theme-light font-body text-[13.5px]"
    >
      <div className="mx-auto flex min-h-[2.1rem] max-w-[80rem] items-center gap-[1.6rem] overflow-x-auto whitespace-nowrap px-4 sm:px-6 md:px-10 xl:px-20">
        {SITES.map((entry) => (
          <a
            key={entry.site}
            href={entry.origin}
            data-room={entry.room}
            className={`no-underline transition-colors hover:text-theme${entry.site === site ? " text-theme" : " text-theme-light"}`}
            {...(entry.site === site
              ? { "aria-current": "true" as const }
              : {})}
          >
            rizom<span className="text-accent">.</span>
            {entry.site}
          </a>
        ))}
      </div>
    </nav>
  );
}

function Wordmark({
  site,
  className,
  home,
}: {
  site: RizomSite | undefined;
  className: string;
  home?: boolean;
}): JSX.Element {
  return (
    <a
      href="/"
      className={`wordmark font-display font-semibold tracking-[-0.01em] [font-variation-settings:'SOFT'_100] ${className}`}
      {...(home ? { "aria-label": site ? `rizom.${site}` : "Rizom home" } : {})}
    >
      <span className="text-theme">rizom</span>
      <span className="text-accent">.</span>
      {site && (
        <span className="wordmark__suffix font-medium text-theme-light">
          {site}
        </span>
      )}
    </a>
  );
}

function Bar({
  path,
  options,
}: {
  path: string;
  options: SiteLayoutOptions;
}): JSX.Element {
  const { cta } = options;
  return (
    <header className="bar sticky top-0 z-[100] border-b border-theme-light bg-nav-fade backdrop-blur-[12px]">
      <div className="bar__inner shell mx-auto flex h-[4.6rem] max-w-[80rem] items-center gap-4 px-4 sm:gap-8 sm:px-6 md:px-10 xl:px-20">
        <Wordmark
          site={options.site}
          className="text-[clamp(22px,5.5vw,26px)]"
          home
        />
        {/* Below sm the footer carries every link; the row keeps the
            wordmark, the toggle and the call to action. */}
        <nav
          className="bar__nav hidden items-center gap-6 sm:flex"
          aria-label="Site"
        >
          {options.barLinks.map((link) => (
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
          href={cta.href}
          className="button self-center whitespace-nowrap rounded-[3px] bg-accent px-3.5 py-2 font-body text-[15px] font-medium text-theme-inverse transition-[filter,transform] hover:brightness-110 hover:-translate-y-px sm:px-[18px] sm:py-[9px] sm:text-[16px]"
        >
          {cta.short ? (
            <>
              <span className="hidden sm:inline">{cta.label}</span>
              <span className="sm:hidden">{cta.short}</span>
            </>
          ) : (
            cta.label
          )}
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

/* The site footer: the brand, the columns and the legal row, on every page. */
function SiteFooter({
  siteInfo,
  options,
}: {
  siteInfo: RizomLayoutProps["siteInfo"];
  options: SiteLayoutOptions;
}): JSX.Element {
  return (
    <footer className="site-footer footer-grid relative z-[1] grid gap-10 border-t border-theme px-4 pt-11 pb-[38px] sm:grid-cols-2 sm:px-6 md:px-10 lg:grid-cols-[1.3fr_1fr_1fr_1fr] xl:px-20">
      <div className="footer-brand">
        <Wordmark site={options.site} className="text-[30px]" />
        <p className="mt-2.5 max-w-[26ch] font-body text-[13.5px] text-theme-light">
          {siteInfo.description}
        </p>
      </div>
      {options.footerColumns.map((column) => (
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
        {options.footerNote && <span>{options.footerNote}</span>}
      </div>
    </footer>
  );
}

function SiteChrome({
  path,
  siteInfo,
  options,
  children,
}: {
  path: string;
  siteInfo: RizomLayoutProps["siteInfo"];
  options: SiteLayoutOptions;
  children: ReactNode;
}): JSX.Element {
  const room =
    typeof options.room === "function" ? options.room(path) : options.room;
  const figure = options.figures[path];
  return (
    <RizomFrame>
      <div data-room={room} className="relative">
        {options.site && <Strip site={options.site} />}
        <Bar path={path} options={options} />
        <main>
          {figure !== undefined ? (
            <StoryPage figure={figure}>{children}</StoryPage>
          ) : (
            children
          )}
        </main>
        <SiteFooter siteInfo={siteInfo} options={options} />
      </div>
    </RizomFrame>
  );
}

export type SiteLayout = (props: RizomLayoutProps) => JSX.Element;

/** A layout for a Rizom site: the chrome above, around whatever sections the page has. */
export function createSiteLayout(options: SiteLayoutOptions): SiteLayout {
  return function SiteLayout({ sections, path, siteInfo }): JSX.Element {
    return (
      <SiteChrome path={path} siteInfo={siteInfo} options={options}>
        {sections}
      </SiteChrome>
    );
  };
}
