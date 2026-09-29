/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactElement } from "react";
import { tabStripStyles as s } from "./operator-tab-strip.styles";
import { styledProps } from "./styled-props";

/** Presentation only. The host owns selection, IDs, panels and keyboard routing. */
export function OperatorTabStrip(props: ComponentProps<"div">): ReactElement {
  return <div role="tablist" {...styledProps(props, s.list)} />;
}
export function OperatorTabButton(
  props: ComponentProps<"button">,
): ReactElement {
  return (
    <button
      type="button"
      role="tab"
      {...styledProps(props, stylex.defaultMarker(), s.button)}
    />
  );
}
export function OperatorTabCount(props: ComponentProps<"span">): ReactElement {
  return <span {...styledProps(props, s.count)} />;
}
