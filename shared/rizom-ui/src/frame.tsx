import type { JSX, ComponentChildren } from "preact";
import type { SiteInfo } from "@brains/site-builder-plugin";

export interface RizomLayoutProps {
  sections: ComponentChildren[];
  title: string;
  description: string;
  path: string;
  siteInfo: SiteInfo;
}

export interface RizomFrameProps {
  children?: ComponentChildren;
}

/**
 * Shared Rizom page frame.
 *
 * Owns only the full-page canvas background and the centered page
 * container. Wrapper sites own their actual chrome/layout composition.
 */
export const RizomFrame = ({ children }: RizomFrameProps): JSX.Element => (
  <>
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

    <div className="max-w-[1440px] mx-auto relative">{children}</div>
  </>
);
