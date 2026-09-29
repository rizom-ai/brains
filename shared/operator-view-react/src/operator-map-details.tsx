/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { mapDetailsStyles as s } from "./operator-map-details.styles";
import { styledProps } from "./styled-props";

export function OperatorMapIndex(
  props: ComponentProps<"aside"> & {
    heading: string;
    description: string;
    remainder?: ReactNode;
    note?: ReactNode;
  },
): ReactElement {
  const { heading, description, remainder, note, children, ...attributes } =
    props;
  return (
    <aside {...styledProps(attributes, s.index)} data-map-index>
      <header {...stylex.props(s.heading)}>
        <h3 {...stylex.props(s.title)}>{heading}</h3>
        <p {...stylex.props(s.description)}>{description}</p>
      </header>
      <ol {...stylex.props(s.list)}>{children}</ol>
      {remainder !== undefined && remainder !== null && remainder !== false && (
        <p {...stylex.props(s.remainder)} data-map-index-remainder>
          {remainder}
        </p>
      )}
      {note !== undefined && note !== null && note !== false && (
        <p {...stylex.props(s.note)} data-map-index-note>
          {note}
        </p>
      )}
    </aside>
  );
}

/** The host owns selection and identifiers; compiled styles read native ARIA state. */
export function OperatorMapIndexItem(
  props: ComponentProps<"button"> & {
    rank: string;
    label: string;
    count: string | number;
  },
): ReactElement {
  const { rank, label, count, ...attributes } = props;
  return (
    <li {...stylex.props(s.item)}>
      <button
        {...styledProps(attributes, s.control)}
        type={attributes.type ?? "button"}
        title={attributes.title ?? label}
      >
        <span {...stylex.props(s.rank)}>{rank}</span>
        <strong {...stylex.props(s.label)}>{label}</strong>
        <b {...stylex.props(s.value)}>{count}</b>
      </button>
    </li>
  );
}

export function OperatorMapLegend(props: ComponentProps<"div">): ReactElement {
  return <div {...styledProps(props, s.legend)} role={props.role ?? "group"} />;
}

export function OperatorMapLegendItem(props: {
  label: string;
  marker: "ring" | "dashed-ring" | "dot";
  tone: "neutral" | "secondary" | "good" | "warn";
}): ReactElement {
  return (
    <span
      {...stylex.props(s.legendItem)}
      data-map-marker={props.marker}
      data-tone={props.tone}
    >
      <i
        {...stylex.props(
          s.marker,
          s[props.tone],
          props.marker === "dot" && s.dot,
          props.marker === "dashed-ring" && s.dashed,
        )}
        aria-hidden="true"
      />
      {props.label}
    </span>
  );
}

export function OperatorMapLegendNote(
  props: ComponentProps<"span">,
): ReactElement {
  return <span {...styledProps(props, s.legendNote)} />;
}
