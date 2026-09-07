/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ReactElement } from "react";
import { factStyles as s } from "./operator-facts.styles";
import { OperatorMetadata } from "./operator-metadata";

/** A fact list is a reading component, not a table or an editable form. */
export function OperatorFacts(props: {
  items: readonly {
    label: string;
    value?: string | number | ReactElement | undefined;
    caption?: string | undefined;
    tone?: "neutral" | "good" | "warn" | "error" | undefined;
  }[];
  density: "compact" | "comfortable";
  presentation?: "reference";
}): ReactElement {
  const compact = props.density === "compact";
  const reference = props.presentation === "reference";
  const root = stylex.props(
    s.root,
    compact && s.compactRoot,
    reference && s.referenceRoot,
  );
  return (
    <dl
      {...root}
      className={`operator-key-values ${root.className ?? ""}`}
      data-facts-presentation={props.presentation}
    >
      {props.items.map((item, index) => (
        <div
          key={`${item.label}:${index}`}
          {...stylex.props(
            s.row,
            compact && s.compactRow,
            reference && s.referenceRow,
          )}
          data-tone={item.tone ?? "neutral"}
        >
          <dt {...stylex.props(s.label, reference && s.referenceLabel)}>
            {item.label}
          </dt>
          {item.value !== undefined && (
            <dd
              {...stylex.props(
                s.value,
                compact && s.compactValue,
                reference && s.referenceValue,
                item.tone === "good" && s.good,
                item.tone === "warn" && s.warn,
                item.tone === "error" && s.error,
              )}
            >
              {typeof item.value === "string" ? (
                <OperatorMetadata values={[item.value]} />
              ) : (
                item.value
              )}
            </dd>
          )}
          {item.caption && <dd {...stylex.props(s.caption)}>{item.caption}</dd>}
        </div>
      ))}
    </dl>
  );
}
