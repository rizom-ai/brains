/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ReactElement, ReactNode } from "react";
import { noticeStyles as s } from "./operator-notice.styles";

/** Full authored text, including line breaks, remains part of the notice. */
export function OperatorNotice(props: {
  title?: string | undefined;
  text: string;
  tone: "neutral" | "good" | "warn" | "error";
  density: "compact" | "comfortable";
  children?: ReactNode;
}): ReactElement {
  const compact = props.density === "compact";
  const root = stylex.props(
    s.root,
    s[props.tone],
    compact ? s.compact : s.comfortable,
  );
  return (
    <aside {...root} data-tone={props.tone}>
      <div {...stylex.props(s.copy)}>
        {props.title && (
          <strong {...stylex.props(s.title, compact && s.compactTitle)}>
            {props.title}
          </strong>
        )}
        <p
          {...stylex.props(
            s.text,
            compact && s.compactText,
            Boolean(props.title) && s.afterTitle,
          )}
        >
          {props.text}
        </p>
      </div>
      {props.children && (
        <div {...stylex.props(s.actions)}>{props.children}</div>
      )}
    </aside>
  );
}
