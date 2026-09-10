/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { actionLinkStyles as s } from "./operator-action-link.styles";

export function OperatorActionLinks(
  props: ComponentProps<"nav">,
): ReactElement {
  const css = stylex.props(s.group);
  return (
    <nav
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
}
/** The host supplies destinations, target/rel, labels, and decorative indicators. */
export function OperatorActionLink(
  props: ComponentProps<"a"> & {
    emphasis?: "primary" | "secondary";
    indicator?: ReactNode;
  },
): ReactElement {
  const { emphasis = "secondary", indicator, children, ...attributes } = props;
  const css = stylex.props(
    stylex.defaultMarker(),
    s.link,
    emphasis === "primary" && s.primary,
  );
  return (
    <a
      {...attributes}
      {...css}
      className={[attributes.className, css.className]
        .filter(Boolean)
        .join(" ")}
    >
      <span {...stylex.props(s.label)}>{children}</span>
      {indicator !== undefined && indicator !== null && indicator !== false && (
        <span
          {...stylex.props(s.indicator)}
          data-action-indicator
          aria-hidden="true"
        >
          {indicator}
        </span>
      )}
    </a>
  );
}
