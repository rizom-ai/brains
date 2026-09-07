/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ReactElement, ReactNode } from "react";
import { listStyles as s } from "./operator-list.styles";
type Density = "compact" | "comfortable";
type Tone = "neutral" | "good" | "warn" | "error";
export function OperatorList(props: {
  density: Density;
  presentation?:
    "standard" | "editorial" | "attention" | "activity" | undefined;
  children: ReactNode;
}): ReactElement {
  const root = stylex.props(
    s.list,
    props.density === "compact" && s.compactList,
  );
  return (
    <ol
      {...root}
      className={`operator-record-list ${root.className ?? ""}`}
      data-presentation={props.presentation}
    >
      {props.children}
    </ol>
  );
}
/** Historical outcomes remain text/badges, not another active exception stripe. */
export function OperatorRecordRow(props: {
  density: Density;
  tone?: Tone | undefined;
  selected?: boolean | undefined;
  interactive?: boolean | undefined;
  master?: boolean | undefined;
  stacked?: boolean | undefined;
  children: ReactNode;
  trailing?: ReactNode;
}): ReactElement {
  return (
    <li
      {...stylex.props(
        s.row,
        props.density === "compact" && s.compactRow,
        props.master && s.master,
        props.stacked && s.stacked,
        props.interactive && s.interactive,
        props.selected && s.selected,
      )}
      data-tone={props.tone ?? "neutral"}
      aria-current={props.selected ? "true" : undefined}
    >
      {props.children}
      {props.trailing && (
        <div
          {...stylex.props(s.trailing, props.stacked && s.stackedTrailing)}
          data-record-trailing="true"
        >
          {props.trailing}
        </div>
      )}
    </li>
  );
}
export function OperatorBadge(props: {
  density: Density;
  tone?: Tone | undefined;
  children: ReactNode;
}): ReactElement {
  const tone = props.tone ?? "neutral";
  const compact = props.density === "compact";
  return (
    <span
      {...stylex.props(
        s.badge,
        compact && s.compactBadge,
        tone === "good" && s.good,
        tone === "warn" && s.warn,
        tone === "error" && s.error,
        compact && tone === "good" && s.compactGood,
        compact && tone === "warn" && s.compactWarn,
        compact && tone === "error" && s.compactError,
      )}
      data-tone={tone}
      data-record-badge="true"
    >
      {props.children}
    </span>
  );
}
