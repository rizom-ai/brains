/** @jsxImportSource react */
import type { JSX } from "react";
import { RizomFrame, type RizomLayoutProps } from "../ui";

export const DefaultRizomLayout = ({
  sections,
}: RizomLayoutProps): JSX.Element => (
  <RizomFrame>
    <main>{sections}</main>
  </RizomFrame>
);
