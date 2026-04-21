import type { JSX, ComponentChildren } from "preact";

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
      className="rizom-frame-canvas-wrap fixed top-0 left-0 w-full h-full pointer-events-none"
    >
      <canvas id="heroCanvas" className="w-full h-full block" />
    </div>

    <div className="max-w-[1440px] mx-auto relative overflow-x-clip">
      {children}
    </div>
  </>
);
