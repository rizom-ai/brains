/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ReactElement, ReactNode } from "react";
import { layoutStyles as s } from "./operator-layout.styles";

export function OperatorColumns(props: {
  primary: ReactNode;
  aside: ReactNode;
  density: "compact" | "comfortable";
  /** Children supply their own section spacing and supporting separators. */
  joined?: boolean;
}): ReactElement {
  const compact = props.density === "compact";
  const root = stylex.props(s.columns, compact && s.compactColumns);
  const primary = stylex.props(s.region, props.joined && s.joinedRegion);
  const aside = stylex.props(
    s.region,
    compact && s.compactAside,
    props.joined && s.joinedRegion,
  );
  return (
    <div {...root} className={`declarative-columns ${root.className ?? ""}`}>
      <div
        {...primary}
        className={`declarative-column ${primary.className ?? ""}`}
      >
        {props.primary}
      </div>
      <div
        {...aside}
        className={`declarative-column declarative-aside ${aside.className ?? ""}`}
      >
        {props.aside}
      </div>
    </div>
  );
}
