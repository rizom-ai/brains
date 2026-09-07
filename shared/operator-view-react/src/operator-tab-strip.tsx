/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactElement } from "react";
import { tabStripStyles as s } from "./operator-tab-strip.styles";

/** Presentation only. The host owns selection, IDs, panels and keyboard routing. */
export function OperatorTabStrip(props: ComponentProps<"div">): ReactElement {
  const css = stylex.props(s.list);
  return (
    <div
      role="tablist"
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
}
export function OperatorTabButton(
  props: ComponentProps<"button">,
): ReactElement {
  const css = stylex.props(stylex.defaultMarker(), s.button);
  return (
    <button
      type="button"
      role="tab"
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
}
export function OperatorTabCount(props: ComponentProps<"span">): ReactElement {
  const css = stylex.props(s.count);
  return (
    <span
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
}
