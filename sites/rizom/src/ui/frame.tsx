import type { JSX, ComponentChildren } from "preact";

export type { RizomLayoutProps } from "@rizom/site";

export interface RizomFrameProps {
  children?: ComponentChildren;
  /**
   * Render the full-page background canvas mount the profile canvas scripts
   * draw into. Sites without a `themeProfile` pass false — the mount would be
   * dead markup.
   */
  canvas?: boolean;
}

/**
 * Shared Rizom page frame.
 *
 * Owns only the full-page canvas background and the centered page
 * container. Wrapper sites own their actual chrome/layout composition.
 */
export const RizomFrame = ({
  children,
  canvas = true,
}: RizomFrameProps): JSX.Element => (
  <>
    {canvas && (
      <div
        id="bgCanvasWrap"
        className="rizom-frame-canvas-wrap fixed top-0 left-0 w-full h-full pointer-events-none"
      >
        <canvas id="heroCanvas" className="w-full h-full block" />
      </div>
    )}

    <div className="max-w-[1440px] mx-auto relative overflow-x-clip">
      {children}
    </div>
  </>
);
