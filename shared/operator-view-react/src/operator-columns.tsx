/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ReactElement, ReactNode } from "react";
import { layoutStyles as s } from "./operator-layout.styles";
import { panelColumnsStyles as panels } from "./operator-panel-columns.styles";

export function OperatorColumns(props: {
  primary: ReactNode;
  aside: ReactNode;
  density: "compact" | "comfortable";
  /** Children supply their own section spacing and supporting separators. */
  joined?: boolean;
  presentation?: "panels";
}): ReactElement {
  const compact = props.density === "compact";
  const panelLayout = props.presentation === "panels";
  const Aside = panelLayout ? "aside" : "div";
  const root = stylex.props(
    panelLayout ? panels.root : s.columns,
    !panelLayout && compact && s.compactColumns,
  );
  const primary = stylex.props(
    s.region,
    props.joined && s.joinedRegion,
    panelLayout && panels.primary,
  );
  const aside = stylex.props(
    s.region,
    compact && s.compactAside,
    props.joined && s.joinedRegion,
    panelLayout && panels.aside,
  );
  return (
    <div
      {...root}
      className={`declarative-columns ${root.className ?? ""}`}
      data-columns-presentation={props.presentation}
    >
      <div
        {...primary}
        className={`declarative-column ${primary.className ?? ""}`}
      >
        {props.primary}
      </div>
      <Aside
        {...aside}
        className={`declarative-column declarative-aside ${aside.className ?? ""}`}
      >
        {props.aside}
      </Aside>
    </div>
  );
}
