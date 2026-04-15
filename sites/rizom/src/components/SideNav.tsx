import type { JSX } from "preact";
import type { RizomSideNavItem } from "../compositions/types";

interface SideNavProps {
  items: RizomSideNavItem[];
}

export const SideNav = ({ items }: SideNavProps): JSX.Element => (
  <aside
    aria-hidden="true"
    className="hidden lg:flex fixed right-8 top-1/2 -translate-y-1/2 z-[90] flex-col gap-[18px] px-2 py-4"
  >
    {items.map((dot) => (
      <a
        key={dot.href}
        href={dot.href}
        className="side-nav-dot"
        data-label={dot.label}
      />
    ))}
  </aside>
);
