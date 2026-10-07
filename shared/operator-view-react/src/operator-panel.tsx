/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { panelStyles as s } from "./operator-panel.styles";
import { styledProps } from "./styled-props";

export function OperatorPanelHeader({
  heading,
  source,
  accessory,
}: {
  heading: ReactNode;
  source?: ReactNode;
  accessory?: ReactNode;
}): ReactElement {
  return (
    <header {...stylex.props(s.heading)}>
      <span {...stylex.props(s.title)}>{heading}</span>
      {source !== undefined && source !== null ? (
        <span {...stylex.props(s.source)}>{source}</span>
      ) : (
        accessory
      )}
    </header>
  );
}

/** A framed, labelled content surface; hosts own its content and source copy. */
export function OperatorPanel(
  props: ComponentProps<"article"> & {
    heading: ReactNode;
    source?: ReactNode;
    accessory?: ReactNode;
    /** Tight reduces phone insets; flush-bottom accommodates an edge-aligned tail. */
    inset?: "standard" | "tight" | "flush-bottom";
    fullWidth?: boolean;
    wash?: "neutral" | "good";
  },
): ReactElement {
  const {
    heading,
    source,
    accessory,
    inset,
    fullWidth,
    wash,
    children,
    ...attributes
  } = props;
  return (
    <article
      {...styledProps(
        attributes,
        s.panel,
        inset === "tight" && s.tight,
        inset === "flush-bottom" && s.flushBottom,
        fullWidth && s.fullWidth,
        wash === "neutral" && s.neutralWash,
        wash === "good" && s.goodWash,
      )}
    >
      <OperatorPanelHeader
        heading={heading}
        source={source}
        accessory={accessory}
      />
      {children}
    </article>
  );
}

export function OperatorPanelGrid(props: ComponentProps<"div">): ReactElement {
  return <div {...styledProps(props, s.grid)} />;
}
