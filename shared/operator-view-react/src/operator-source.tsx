/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ReactElement } from "react";
import { sourceStyles as s } from "./operator-source.styles";

export function OperatorSource(props: {
  text: string;
  label?: string | undefined;
  truncated?: boolean | undefined;
  framed?: boolean | undefined;
  density: "compact" | "comfortable";
}): ReactElement {
  const root = stylex.props(s.root, props.framed !== false && s.frame);
  return (
    <article {...root} className={`operator-source ${root.className ?? ""}`}>
      {props.label && (
        <h3
          {...stylex.props(
            s.heading,
            props.density === "compact" && s.compactHeading,
          )}
        >
          {props.label}
        </h3>
      )}
      <pre {...stylex.props(s.text)}>{props.text}</pre>
      {props.truncated && (
        <small {...stylex.props(s.caption)}>
          Source content was truncated by its provider.
        </small>
      )}
    </article>
  );
}
