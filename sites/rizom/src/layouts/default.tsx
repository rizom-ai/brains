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
    <div className="bg-theme relative min-h-screen">
      {/* Full-viewport canvas background */}
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

      <Header />
      <SideNav />

      <main>{sections}</main>

      <Footer />
    </div>
  );
}
