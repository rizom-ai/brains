import type { JSX } from "preact";
import type { RizomShellModel } from "../compositions/types";

interface SideNavProps {
  shell: RizomShellModel;
}

export const SideNav = ({ shell }: SideNavProps): JSX.Element => (
  <aside
    aria-hidden="true"
    className="hidden lg:flex fixed right-8 top-1/2 -translate-y-1/2 z-[90] flex-col gap-[18px] px-2 py-4"
  >
    {shell.sideNav.map((dot) => (
      <a
        key={dot.href}
        href={dot.href}
        className="side-nav-dot"
        data-label={dot.label}
      />
    ))}
  </aside>
);
