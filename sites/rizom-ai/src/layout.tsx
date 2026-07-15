/** @jsxImportSource preact */
import type { JSX, ComponentChildren } from "preact";
import { RizomFrame, type RizomLayoutProps } from "@rizom/site-rizom";

/**
 * The consolidated rizom.ai chrome (rev-5): a quiet org-level faces strip
 * above a per-face contextual nav, a mycelium rail seeping down the left edge,
 * and one four-column footer on every face. The active face is derived from
 * the route path; each face keeps its live links and old-domain nameplate.
 */

type FaceKey = "brain" | "work" | "foundation";

interface FaceLink {
  label: string;
  href: string;
  external?: boolean;
}

// The three faces of the practice. Home ("/") is the umbrella above them —
// it claims no face in the strip and wears the plain wordmark.
const FACES: { key: FaceKey; label: string; href: string }[] = [
  { key: "brain", label: "Brain", href: "/brain" },
  { key: "work", label: "Work", href: "/work" },
  { key: "foundation", label: "Foundation", href: "/foundation" },
];

interface FaceChrome {
  /** Suffix shown after the wordmark as the room nameplate */
  nameplate: string | null;
  links: FaceLink[];
  cta: FaceLink;
}

const FACE_CHROME: Record<FaceKey, FaceChrome> = {
  brain: {
    nameplate: "brain",
    links: [
      { label: "Docs ↗", href: "https://docs.rizom.ai", external: true },
      {
        label: "GitHub ↗",
        href: "https://github.com/rizom-ai",
        external: true,
      },
    ],
    cta: { label: "Get Started", href: "/brain#quickstart" },
  },
  work: {
    nameplate: "work",
    links: [
      { label: "Workshop", href: "/work#workshop" },
      { label: "Contact", href: "/work#contact" },
    ],
    // The live Team Type quiz, salvaged from rizom.work's site-info.
    cta: {
      label: "Take the quiz",
      href: "https://form.typeform.com/to/NGqo9Fnf",
    },
  },
  foundation: {
    nameplate: "foundation",
    links: [
      { label: "Research", href: "/foundation#research" },
      { label: "Events", href: "/foundation#events" },
    ],
    cta: { label: "Read Manifesto", href: "/foundation#research" },
  },
};

// The umbrella page's own chrome: the plain wordmark, links into the room and
// docs, and a get-started CTA that points at the product room.
const HOME_CHROME: FaceChrome = {
  nameplate: null,
  links: [
    { label: "Brain", href: "/brain" },
    { label: "Docs ↗", href: "https://docs.rizom.ai", external: true },
  ],
  cta: { label: "Get Started", href: "/brain" },
};

function isHome(path: string): boolean {
  return path === "/";
}

// The active face drives the room accent (data-room). Home and /brain both
// wear brass — home because it is the umbrella, /brain because brass is the
// product face — so both resolve to "brain" (the theme's default accent).
function activeFace(path: string): FaceKey {
  if (path === "/work" || path.startsWith("/work/")) return "work";
  if (path === "/foundation" || path.startsWith("/foundation/")) {
    return "foundation";
  }
  return "brain";
}

// The org-level indexes: cross-room aggregations (everything published,
// everyone in the network) that belong to no single face. They live
// top-right on every face, and claim the current page on their own path.
const ORG_INDEXES: { label: string; href: string }[] = [
  { label: "Writing", href: "/writing" },
  { label: "Network", href: "/network" },
];

function orgIndexActive(path: string): string | null {
  const match = ORG_INDEXES.find(
    (index) => path === index.href || path.startsWith(`${index.href}/`),
  );
  return match ? match.href : null;
}

function FacesStrip({ path }: { path: string }): JSX.Element {
  const face = activeFace(path);
  const activeIndex = orgIndexActive(path);
  const home = isHome(path);
  return (
    <div className="relative z-[2] flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border-b border-theme-light px-4 py-3 font-label text-label-xs uppercase tracking-[0.12em] sm:gap-x-6 sm:px-6 sm:tracking-[0.14em] md:px-10 xl:px-20">
      <span className="text-theme-muted">rizom</span>
      {FACES.map((item) =>
        // No face is current on the umbrella home, nor on a cross-room index.
        item.key === face && !activeIndex && !home ? (
          <a
            key={item.key}
            href={item.href}
            className="-my-2 inline-block py-2 text-accent"
            aria-current="page"
          >
            {item.label}
          </a>
        ) : (
          <a
            key={item.key}
            href={item.href}
            className="-my-2 inline-block py-2 text-theme-light transition-colors hover:text-theme"
          >
            {item.label}
          </a>
        ),
      )}
      <div className="ml-auto flex items-baseline gap-4 sm:gap-6">
        {ORG_INDEXES.map((index) => {
          const active = activeIndex === index.href;
          return (
            <a
              key={index.href}
              href={index.href}
              className={`-my-2 inline-block py-2 transition-colors ${
                active ? "text-accent" : "text-theme-light hover:text-theme"
              }`}
              {...(active ? { "aria-current": "page" } : {})}
            >
              {index.label}
            </a>
          );
        })}
        {/* boot.js binds by id and syncs the label; window.toggleTheme
            (injected by site-engine) flips data-theme + persists it. */}
        <button
          id="themeToggle"
          type="button"
          aria-label="Toggle color theme"
          className="-my-2 inline-block cursor-pointer py-2 uppercase text-theme-light transition-colors hover:text-theme"
        >
          ☀ Light
        </button>
      </div>
    </div>
  );
}

function Wordmark({ nameplate }: { nameplate: string | null }): JSX.Element {
  return (
    <a
      href="/"
      className="font-display text-[clamp(22px,5.5vw,26px)] font-semibold tracking-[-0.01em] [font-variation-settings:'SOFT'_100]"
      aria-label="Rizom home"
    >
      <span className="text-theme">rizom</span>
      <span className="text-accent">.</span>
      {nameplate && (
        <span className="text-[clamp(17px,4.3vw,20px)] font-normal text-theme-muted">
          {nameplate}
        </span>
      )}
    </a>
  );
}

function FaceNav({
  face,
  home,
}: {
  face: FaceKey;
  home: boolean;
}): JSX.Element {
  const chrome = home ? HOME_CHROME : FACE_CHROME[face];
  // Deliberately NOT merged with siteInfo.navigation: entity plugins
  // register slot-based nav entries for every list route (topics,
  // posts, …), which floods the bar. Each room owns its own links.
  const links: FaceLink[] = chrome.links;

  return (
    <nav className="relative z-[2] flex items-baseline gap-4 px-4 py-5 sm:gap-8 sm:px-6 md:px-10 xl:px-20">
      <Wordmark nameplate={chrome.nameplate} />
      {/* Below sm the footer carries every chrome link; the row keeps
          just the wordmark and the CTA so nothing overflows. */}
      <div className="hidden items-baseline gap-7 sm:flex">
        {links.map((link) => (
          <a
            key={`${link.href}-${link.label}`}
            href={link.href}
            className="font-body text-[16px] text-theme-light transition-colors hover:text-theme"
          >
            {link.label}
          </a>
        ))}
      </div>
      <div className="flex-1" />
      <a
        href={chrome.cta.href}
        className="self-center whitespace-nowrap rounded-[3px] bg-accent px-3.5 py-2 font-body text-[15px] font-medium text-theme-inverse transition-[filter,transform] hover:brightness-110 hover:-translate-y-px sm:px-[18px] sm:py-[9px] sm:text-[16px]"
      >
        {chrome.cta.label}
      </a>
    </nav>
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
  links: FaceLink[];
}

/* The site footer — mockup `.footer`: four columns plus the legal row.
   Shown on every face; the signature comes from the site-info entity. */
const FOOTER_COLUMNS: FooterColumn[] = [
  {
    heading: "The brain",
    links: [
      { label: "Get started", href: "/brain#quickstart" },
      { label: "Documentation ↗", href: "https://docs.rizom.ai" },
      { label: "GitHub ↗", href: "https://github.com/rizom-ai" },
      { label: "Network", href: "/network" },
    ],
  },
  {
    heading: "The practice",
    links: [
      { label: "The workshop", href: "/work#workshop" },
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
    <footer className="relative z-[1] grid gap-10 border-t border-theme px-4 pt-11 pb-[38px] sm:grid-cols-2 sm:px-6 md:px-10 lg:grid-cols-[1.3fr_1fr_1fr_1fr] xl:px-20">
      <div>
        <a
          href="/"
          className="font-display text-[30px] font-semibold tracking-[-0.01em] [font-variation-settings:'SOFT'_100]"
        >
          <span className="text-theme">rizom</span>
          <span className="text-accent">.</span>
        </a>
        <p className="mt-2.5 max-w-[26ch] font-body text-[13.5px] text-theme-light">
          {siteInfo.description}
        </p>
      </div>
      {FOOTER_COLUMNS.map((column) => (
        <div key={column.heading}>
          <div className="mb-3 font-label text-[11px] uppercase tracking-[0.18em] text-theme-light">
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
      <div className="col-span-full mt-2 flex flex-wrap items-center gap-x-[22px] gap-y-2 border-t border-theme-light pt-4 font-label text-[11.5px] text-theme-light">
        {signature(siteInfo) && <span>{signature(siteInfo)}</span>}
      </div>
    </footer>
  );
}

/* Mycelium rail — dashed brass root seeping down the left page edge,
   with twigs and glowing nodes. Geometry from the mockup; colors and
   the seep/nodeglow animations come from the theme's .myc-* classes. */
function MyceliumRail(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute top-0 -left-[18px] hidden h-full w-[210px] xl:block"
      viewBox="0 0 210 2400"
      preserveAspectRatio="xMidYMin slice"
    >
      <path
        className="myc-root"
        d="M96,0 C74,180 120,320 98,500 C76,680 122,820 100,1040 C80,1230 116,1380 100,1580 C88,1760 112,1900 98,2100 C90,2250 104,2330 98,2400"
      />
      <path className="myc-twig" d="M98,500 C140,530 165,515 196,540" />
      <path className="myc-twig" d="M100,1040 C56,1080 44,1140 26,1160" />
      <path className="myc-twig" d="M100,1580 C146,1610 158,1665 190,1680" />
      <path className="myc-twig" d="M98,2100 C58,2140 50,2190 32,2205" />
      <path className="myc-twig" d="M86,250 C52,272 46,310 28,320" />
      <circle className="myc-node" cx="98" cy="500" r="4" />
      <circle
        className="myc-node"
        cx="100"
        cy="1040"
        r="4"
        style="animation-delay:.9s"
      />
      <circle
        className="myc-node"
        cx="100"
        cy="1580"
        r="4"
        style="animation-delay:1.7s"
      />
      <circle
        className="myc-node"
        cx="98"
        cy="2100"
        r="4"
        style="animation-delay:2.4s"
      />
    </svg>
  );
}

function RizomAiChrome({
  path,
  siteInfo,
  children,
}: {
  path: string;
  siteInfo: RizomLayoutProps["siteInfo"];
  children: ComponentChildren;
}): JSX.Element {
  const face = activeFace(path);
  const home = isHome(path);
  return (
    <RizomFrame canvas={false}>
      {/* xl:pl matches the mockup's 148px left rail (68 + the 80px
          section gutter) so the mycelium has real room to seep. */}
      <div data-room={face} className="relative xl:pl-[68px]">
        <MyceliumRail />
        <header className="sticky top-0 z-[100] border-b border-theme-light bg-nav-fade backdrop-blur-[12px]">
          <FacesStrip path={path} />
          <FaceNav face={face} home={home} />
        </header>
        <main>{children}</main>
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
