/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ReactElement } from "react";
import { statsStyles as s } from "./operator-stats.styles";
export function OperatorStats(props: {
  items: readonly {
    label: string;
    value: string | number;
    tone?: "neutral" | "good" | "warn" | "error" | undefined;
    caption?: string | undefined;
  }[];
  density: "compact" | "comfortable";
  placement?: "body" | "head";
}): ReactElement {
  const compact = props.density === "compact",
    head = props.placement === "head";
  return (
    <dl
      {...stylex.props(s.root, compact && s.compact, head && s.head)}
      data-stats-placement={props.placement ?? "body"}
    >
      {props.items.map((item, index) => (
        <div
          key={`${item.label}:${index}`}
          data-tone={item.tone ?? "neutral"}
          {...stylex.props(
            s.item,
            compact && s.compactItem,
            head && s.headItem,
          )}
        >
          <dt {...stylex.props(s.label, compact && s.compactLabel)}>
            {item.label}
          </dt>
          <dd
            {...stylex.props(
              s.value,
              compact && s.compactValue,
              head && s.headValue,
              item.tone === "good" && s.good,
              item.tone === "warn" && s.warn,
              item.tone === "error" && s.error,
            )}
          >
            {item.value}
          </dd>
          {item.caption && (
            <small {...stylex.props(s.caption)}>{item.caption}</small>
          )}
        </div>
      ))}
    </dl>
  );
}
