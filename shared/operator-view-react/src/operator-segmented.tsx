/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactElement } from "react";
import { segmentedStyles as s } from "./operator-segmented.styles";

/** Hosts own roles, selection, counts, and interactions; native ARIA drives paint. */
export function OperatorSegmentedGroup(
  props: ComponentProps<"div">,
): ReactElement {
  const css = stylex.props(s.group);
  return (
    <div
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
}
export function OperatorSegmentedButton(
  props: ComponentProps<"button"> & { emphasis?: "attention" | undefined },
): ReactElement {
  const { emphasis, ...attributes } = props;
  const css = stylex.props(s.button, emphasis === "attention" && s.attention);
  return (
    <button
      type="button"
      {...attributes}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
}
