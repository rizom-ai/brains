/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ReactElement } from "react";
import { statusStyles as s } from "./operator-status.styles";
import { OperatorPanelList } from "./operator-panel-content";

type StatusTone = "good" | "warn" | "error";

/** Decorative indicator; the adjacent host-authored text carries the meaning. */
export function OperatorStatusDot(props: { tone: StatusTone }): ReactElement {
  return (
    <span
      {...stylex.props(
        s.dot,
        props.tone === "good" && s.good,
        props.tone === "warn" && s.warn,
        props.tone === "error" && s.error,
        props.tone !== "good" && s.cautionGlow,
      )}
      aria-hidden="true"
    />
  );
}

export function OperatorStatusList(props: {
  items: readonly {
    id: string;
    label: string;
    status: string;
    tone: StatusTone;
  }[];
}): ReactElement {
  return (
    <OperatorPanelList>
      {props.items.map((item) => (
        <li key={item.id} {...stylex.props(s.row)} data-tone={item.tone}>
          <span {...stylex.props(s.copy)}>
            <OperatorStatusDot tone={item.tone} />
            <strong {...stylex.props(s.label)}>{item.label}</strong>
          </span>
          <small
            {...stylex.props(
              s.status,
              item.tone === "good" && s.good,
              item.tone === "warn" && s.warn,
              item.tone === "error" && s.error,
            )}
          >
            {item.status}
          </small>
        </li>
      ))}
    </OperatorPanelList>
  );
}
