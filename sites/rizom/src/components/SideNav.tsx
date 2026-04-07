import type { JSX } from "preact";

const DOTS: Array<{ href: string; label: string }> = [
  { href: "#hero", label: "Intro" },
  { href: "#problem", label: "Problem" },
  { href: "#answer", label: "Answer" },
  { href: "#ownership", label: "Open" },
  { href: "#quickstart", label: "Start" },
  { href: "#mission", label: "Vision" },
];

export const SideNav = (): JSX.Element => (
  <aside
    aria-hidden="true"
    className="hidden lg:flex fixed right-8 top-1/2 -translate-y-1/2 z-[90] flex-col gap-[18px] px-2 py-4"
  >
    {DOTS.map((dot) => (
      <a
        key={dot.href}
        href={dot.href}
        className="side-nav-dot"
        data-label={dot.label}
      />
    ))}
  </aside>
);
