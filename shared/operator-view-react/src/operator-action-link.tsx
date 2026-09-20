/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { actionLinkStyles as s } from "./operator-action-link.styles";
import { styledProps } from "./styled-props";

export function OperatorActionLinks(
  props: ComponentProps<"nav">,
): ReactElement {
  return <nav {...styledProps(props, s.group)} />;
}
/** The host supplies destinations, target/rel, labels, and decorative indicators. */
export function OperatorActionLink(
  props: ComponentProps<"a"> & {
    emphasis?: "primary" | "secondary";
    indicator?: ReactNode;
  },
): ReactElement {
  const { emphasis = "secondary", indicator, children, ...attributes } = props;
  return (
    <a
      {...styledProps(
        attributes,
        stylex.defaultMarker(),
        s.link,
        emphasis === "primary" && s.primary,
      )}
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
