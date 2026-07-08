import type { JSX, ComponentChildren } from "preact";
import { RizomFrame, type RizomLayoutProps } from "@brains/site-rizom";

type FaceKey = "platform" | "work" | "foundation";

interface FaceLink {
  label: string;
  href: string;
  external?: boolean;
}

const FACES: { key: FaceKey; label: string; href: string }[] = [
  { key: "platform", label: "Platform", href: "/" },
  { key: "work", label: "Work", href: "/work" },
  { key: "foundation", label: "Foundation", href: "/foundation" },
];

interface FaceChrome {
  /** Old-domain suffix shown after the wordmark as the room nameplate */
  nameplate: string | null;
  links: FaceLink[];
  cta: FaceLink;
}

const FACE_CHROME: Record<FaceKey, FaceChrome> = {
  platform: {
    nameplate: null,
    links: [{ label: "Docs ↗", href: "https://docs.rizom.ai", external: true }],
    cta: { label: "Get Started", href: "#hero" },
  },
  work: {
    nameplate: "work",
    links: [
      { label: "Workshop", href: "/work#workshop" },
      { label: "Contact", href: "/work#contact" },
    ],
    cta: { label: "Take the quiz", href: "/work#quiz" },
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

function activeFace(path: string): FaceKey {
  if (path === "/work" || path.startsWith("/work/")) return "work";
  if (path === "/foundation" || path.startsWith("/foundation/")) {
    return "foundation";
  }
  return "platform";
}

function FacesStrip({ face }: { face: FaceKey }): JSX.Element {
  return (
    <div className="relative z-[2] flex items-baseline gap-6 border-b border-theme-light px-6 py-3 font-label text-label-xs uppercase tracking-[0.14em] md:px-10 xl:px-20">
      <span className="text-theme-muted">rizom</span>
      {FACES.map((item) =>
        item.key === face ? (
          <a
            key={item.key}
            href={item.href}
            className="text-accent"
            aria-current="page"
          >
            {item.label}
          </a>
        ) : (
          <a
            key={item.key}
            href={item.href}
            className="text-theme-light transition-colors hover:text-theme"
          >
            {item.label}
          </a>
        ),
      )}
      <span className="ml-auto font-display text-[13px] normal-case italic tracking-normal text-theme-light">
        one practice · three faces
      </span>
    </div>
  );
}

function Wordmark({ face }: { face: FaceKey }): JSX.Element {
  const nameplate = FACE_CHROME[face].nameplate;
  return (
    <a
      href="/"
      className="font-display text-[26px] font-semibold tracking-[-0.01em] [font-variation-settings:'SOFT'_100]"
      aria-label="Rizom home"
    >
      <span className="text-theme">rizom</span>
      <span className="text-accent">.</span>
      {nameplate && (
        <span className="text-[20px] font-normal text-theme-muted">
          {nameplate}
        </span>
      )}
    </a>
  );
}

function FaceNav({ face }: { face: FaceKey }): JSX.Element {
  const chrome = FACE_CHROME[face];
  // Deliberately NOT merged with siteInfo.navigation: entity plugins
  // register slot-based nav entries for every list route (topics,
  // posts, …), which floods the bar. Each room owns its own links.
  const links: FaceLink[] = chrome.links;

  return (
    <nav className="relative z-[2] flex items-baseline gap-8 px-6 py-5 md:px-10 xl:px-20">
      <Wordmark face={face} />
      <div className="hidden items-baseline gap-7 md:flex">
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
        className="self-center rounded-[3px] bg-accent px-[18px] py-[9px] font-body text-[16px] font-medium text-theme-inverse transition-[filter,transform] hover:brightness-110 hover:-translate-y-px"
      >
        {chrome.cta.label}
      </a>
    </nav>
  );
}

function ThemeToggle(): JSX.Element {
  return (
    <button
      id="themeToggle"
      aria-label="Toggle light mode"
      className="rounded-md border border-theme-light bg-transparent px-2.5 py-1.5 font-label text-[12px] text-theme-light transition-colors hover:border-theme hover:text-theme"
    >
      ☀ Light
    </button>
  );
}

interface FooterColumn {
  heading: string;
  links: FaceLink[];
}

/* Home's four-column footer — mockup `.footer` with the Stichting
   legal row. Rooms get the slim `.siteband` provenance line instead. */
const FOOTER_COLUMNS: FooterColumn[] = [
  {
    heading: "The platform",
    links: [
      { label: "Get started", href: "/#quickstart" },
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
      { label: "Writing", href: "/foundation#research" },
      { label: "Events", href: "/foundation#events" },
      { label: "Support", href: "/foundation#support" },
    ],
  },
];

function PlatformFooter({
  siteInfo,
}: {
  siteInfo: RizomLayoutProps["siteInfo"];
}): JSX.Element {
  return (
    <footer className="relative z-[1] grid gap-10 border-t border-theme px-6 pt-11 pb-[38px] md:grid-cols-2 md:px-10 xl:grid-cols-[1.3fr_1fr_1fr_1fr] xl:px-20">
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
              className="block py-[3px] font-body text-[15.5px] text-theme-light no-underline transition-colors hover:text-theme"
            >
              {link.label}
            </a>
          ))}
        </div>
      ))}
      <div className="col-span-full mt-2 flex flex-wrap items-center gap-x-[22px] gap-y-2 border-t border-theme-light pt-4 font-label text-[11.5px] text-theme-light">
        <span>{siteInfo.copyright}</span>
        <span>Apache-2.0</span>
        <span className="flex-1" />
        <span>
          rizom.work &amp; rizom.foundation now live here — old links redirect
        </span>
        <ThemeToggle />
      </div>
    </footer>
  );
}

/* Room siteband — provenance line + legal, per mockup. */
const SITEBAND: Record<"work" | "foundation", { from: string; legal: string }> =
  {
    work: { from: "rizom.work", legal: "© 2026 · Rizom Collective" },
    foundation: {
      from: "rizom.foundation",
      legal: "Stichting Rizom · Amsterdam · Rotterdam · Berlin",
    },
  };

function RoomSiteband({ face }: { face: "work" | "foundation" }): JSX.Element {
  const band = SITEBAND[face];
  return (
    <footer className="relative z-[1] flex flex-wrap items-baseline gap-[26px] border-t border-theme-light px-6 py-4 font-label text-[12px] text-theme-light md:px-10 xl:px-20">
      <span>
        previously <b className="font-medium text-theme-muted">{band.from}</b> —
        you were redirected here
      </span>
      <span className="flex-1" />
      <span>{band.legal}</span>
      <ThemeToggle />
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
  return (
    <RizomFrame>
      {/* xl:pl matches the mockup's 148px left rail (68 + the 80px
          section gutter) so the mycelium has real room to seep. */}
      <div data-room={face} className="relative xl:pl-[68px]">
        <MyceliumRail />
        <header className="sticky top-0 z-[100] border-b border-theme-light bg-nav-fade backdrop-blur-[12px]">
          <FacesStrip face={face} />
          <FaceNav face={face} />
        </header>
        <main>{children}</main>
        {face === "platform" ? (
          <PlatformFooter siteInfo={siteInfo} />
        ) : (
          <RoomSiteband face={face} />
        )}
      </div>
    </RizomFrame>
  );
}

export const RizomAiLayout = ({
  sections,
  path,
  siteInfo,
}: RizomLayoutProps): JSX.Element => (
  <RizomAiChrome path={path} siteInfo={siteInfo}>
    {sections}
  </RizomAiChrome>
);
