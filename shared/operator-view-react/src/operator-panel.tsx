/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { panelStyles as s } from "./operator-panel.styles";

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
  const css = stylex.props(
    s.panel,
    inset === "tight" && s.tight,
    inset === "flush-bottom" && s.flushBottom,
    fullWidth && s.fullWidth,
    wash === "neutral" && s.neutralWash,
    wash === "good" && s.goodWash,
  );
  return (
    <article
      {...attributes}
      {...css}
      className={[attributes.className, css.className]
        .filter(Boolean)
        .join(" ")}
    >
      <header {...stylex.props(s.heading)}>
        <span {...stylex.props(s.title)}>{heading}</span>
        {source !== undefined && source !== null ? (
          <span {...stylex.props(s.source)}>{source}</span>
        ) : (
          accessory
        )}
      </header>
      {children}
    </article>
  );
}

export function OperatorPanelGrid(props: ComponentProps<"div">): ReactElement {
  const css = stylex.props(s.grid);
  return (
    <div
      {...props}
      {...css}
      className={[props.className, css.className].filter(Boolean).join(" ")}
    />
  );
}
