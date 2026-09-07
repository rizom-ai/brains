/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ReactElement } from "react";
import { factStyles as s } from "./operator-facts.styles";
import { OperatorMetadata } from "./operator-metadata";

/** A fact list is a reading component, not a table or an editable form. */
export function OperatorFacts(props: {
  items: readonly {
    label: string;
    value?: string | undefined;
    caption?: string | undefined;
    tone?: "neutral" | "good" | "warn" | "error" | undefined;
  }[];
  density: "compact" | "comfortable";
}): ReactElement {
  const compact = props.density === "compact";
  const root = stylex.props(s.root, compact && s.compactRoot);
  return (
    <dl {...root} className={`operator-key-values ${root.className ?? ""}`}>
      {props.items.map((item, index) => (
        <div
          {...stylex.props(s.row, compact && s.compactRow)}
          key={`${item.label}:${index}`}
          data-tone={item.tone ?? "neutral"}
        >
          <dt {...stylex.props(s.label)}>{item.label}</dt>
          {item.value !== undefined && (
            <dd
              {...stylex.props(
                s.value,
                compact && s.compactValue,
                item.tone === "good" && s.good,
                item.tone === "warn" && s.warn,
                item.tone === "error" && s.error,
              )}
            >
              <OperatorMetadata values={[item.value]} />
            </dd>
          )}
          {item.caption && <dd {...stylex.props(s.caption)}>{item.caption}</dd>}
        </div>
      ))}
    </dl>
  );
}
