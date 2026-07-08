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
      <span className="ml-auto font-display text-[12px] normal-case italic tracking-normal text-theme-light">
        one practice · three faces
      </span>
    </div>
  );
}

function Wordmark({ face }: { face: FaceKey }): JSX.Element {
  const nameplate = FACE_CHROME[face].nameplate;
  return (
    <a href="/" className="font-nav text-[20px]" aria-label="Rizom home">
      <span className="font-bold text-theme">rizom</span>
      <span className="font-bold text-accent">.</span>
      {nameplate && <span className="text-theme-muted">{nameplate}</span>}
    </a>
  );
}

function FaceNav({
  face,
  siteInfo,
}: {
  face: FaceKey;
  siteInfo: RizomLayoutProps["siteInfo"];
}): JSX.Element {
  const chrome = FACE_CHROME[face];
  const links: FaceLink[] = [
    ...chrome.links,
    ...siteInfo.navigation.primary,
    ...siteInfo.navigation.secondary,
  ];

  return (
    <nav className="relative z-[2] flex items-center justify-between px-6 py-4 md:px-10 xl:px-20">
      <Wordmark face={face} />
      <div className="flex items-center gap-5 md:gap-8">
        <div className="hidden items-center gap-6 md:flex">
          {links.map((link) => (
            <a
              key={`${link.href}-${link.label}`}
              href={link.href}
              className="font-body text-[15px] text-theme-muted transition-colors hover:text-theme"
            >
              {link.label}
            </a>
          ))}
        </div>
        <a
          href={chrome.cta.href}
          className="rounded-[999px] border border-theme px-4 py-2 font-body text-[13px] font-semibold text-theme transition-colors hover:border-accent hover:text-accent md:px-5"
        >
          {chrome.cta.label}
        </a>
      </div>
    </nav>
  );
}

function Footer({
  siteInfo,
}: {
  siteInfo: RizomLayoutProps["siteInfo"];
}): JSX.Element {
  return (
    <footer className="relative z-[1] border-t border-theme-light px-6 py-8 md:px-10 xl:px-20">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-label text-label-sm uppercase tracking-[0.22em] text-theme-light">
            {siteInfo.copyright}
          </p>
          <p className="mt-2 max-w-[560px] font-body text-body-xs text-theme-muted">
            {siteInfo.description}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <span className="font-body text-body-xs text-theme-light">
            Stichting Rizom · Amsterdam · Rotterdam · Berlin
          </span>
          <button
            id="themeToggle"
            aria-label="Toggle light mode"
            className="rounded-md border border-theme-light bg-transparent px-2.5 py-1.5 font-body text-label-md text-theme-light transition-colors hover:border-theme hover:text-theme"
          >
            ☀ Light
          </button>
        </div>
      </div>
    </footer>
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
      <header className="sticky top-0 z-[100] border-b border-theme-light bg-nav-fade backdrop-blur-[12px]">
        <FacesStrip face={face} />
        <FaceNav face={face} siteInfo={siteInfo} />
      </header>
      <main>{children}</main>
      <Footer siteInfo={siteInfo} />
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
