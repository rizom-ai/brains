import type { JSX, ComponentChildren } from "preact";

export interface RizomFrameProps {
  children?: ComponentChildren;
}

/**
 * Shared Rizom page frame.
 *
 * Owns only the centered page container. Wrapper sites own their actual
 * chrome/layout composition.
 */
export const RizomFrame = ({ children }: RizomFrameProps): JSX.Element => (
  <div className="max-w-[1440px] mx-auto relative overflow-x-clip">
    {children}
  </div>
);
