import type { JSX, ComponentChildren } from "preact";
import type { SiteInfo } from "@brains/site-builder-plugin";
import type { RizomShellModel } from "../compositions/types";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { SideNav } from "../components/SideNav";

export interface RizomLayoutProps {
  sections: ComponentChildren[];
  title: string;
  description: string;
  path: string;
  siteInfo: SiteInfo;
}

/**
 * Build a Rizom page layout closed over explicit shell data.
 *
 * This keeps the shared shell primitive-only while app-specific
 * compositions can supply their own nav/footer/side-nav models.
 */
export function createRizomLayout(shell: RizomShellModel) {
  return function RizomLayout({ sections }: RizomLayoutProps): JSX.Element {
    return (
      <>
        {/* Full-viewport canvas background — lives outside the centered
            container so it spans the full viewport, not just 1440px. */}
        <div
          id="bgCanvasWrap"
          className="fixed top-0 left-0 w-full h-full pointer-events-none"
          style={{ zIndex: 0, opacity: 0.6 }}
        >
          <canvas
            id="heroCanvas"
            style={{ width: "100%", height: "100%", display: "block" }}
          />
        </div>

        {/* Centered 1440px container for everything else. The fixed nav,
            side-nav, and bg canvas are positioned to viewport regardless. */}
        <div className="max-w-[1440px] mx-auto relative">
          <Header shell={shell} />
          <SideNav shell={shell} />
          <main>{sections}</main>
          <Footer shell={shell} />
        </div>
      </>
    );
  };
}
