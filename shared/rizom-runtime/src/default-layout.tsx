import type { JSX } from "preact";
import { RizomFrame, type RizomLayoutProps } from "@brains/rizom-ui";

export const DefaultRizomLayout = ({
  sections,
}: RizomLayoutProps): JSX.Element => (
  <RizomFrame>
    <main>{sections}</main>
  </RizomFrame>
);
