/** @jsxImportSource react */
import type { JSX, ReactNode } from "react";

export type { RizomLayoutProps } from "../contracts";

export interface RizomFrameProps {
  children?: ReactNode;
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
