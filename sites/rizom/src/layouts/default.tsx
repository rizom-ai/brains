import type { JSX, ComponentChildren } from "preact";
import type { SiteInfo } from "@brains/site-builder-plugin";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { SideNav } from "../components/SideNav";

export interface DefaultLayoutProps {
  sections: ComponentChildren[];
  title: string;
  description: string;
  path: string;
  siteInfo: SiteInfo;
}

/**
 * Default layout for rizom sites.
 *
 * Structure mirrors docs/design/rizom-ai.themed.html:
 *   - Fixed full-viewport canvas background (behind everything)
 *   - Fixed top nav
 *   - Fixed right-side scroll-spy indicator (desktop only)
 *   - <main>{sections}</main>
 *   - Footer with theme toggle
 *
 * The variant-specific canvas script (tree / constellation / roots)
 * and the scroll-reveal IntersectionObserver are injected via the
 * site plugin's head-script hook (see RizomSitePlugin).
 */
export function DefaultLayout({ sections }: DefaultLayoutProps): JSX.Element {
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
        <Header />
        <SideNav />
        <main>{sections}</main>
        <Footer />
      </div>
    </>
  );
}
