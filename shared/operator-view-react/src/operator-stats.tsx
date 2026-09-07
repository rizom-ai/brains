/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ReactElement } from "react";
import { statsStyles as s } from "./operator-stats.styles";
import { statsBandStyles as b } from "./operator-stats-band.styles";
export function OperatorStats(props: {
  items: readonly {
    label: string;
    value: string | number;
    tone?: "neutral" | "good" | "warn" | "error" | undefined;
    caption?: string | undefined;
    captionTone?: "neutral" | "good" | "warn" | "error";
  }[];
  density: "compact" | "comfortable";
  placement?: "body" | "head";
  presentation?: "ledger" | "band";
}): ReactElement {
  const compact = props.density === "compact",
    head = props.placement === "head",
    ledger = props.presentation === "ledger",
    band = props.presentation === "band";
  const Caption = band ? "dd" : "small";
  return (
    <dl
      {...stylex.props(
        band ? b.root : s.root,
        !band && compact && s.compact,
        !band && head && s.head,
        ledger && s.ledger,
      )}
      data-stats-placement={props.placement ?? "body"}
      data-stats-presentation={props.presentation}
    >
      {props.items.map((item, index) => (
        <div
          key={`${item.label}:${index}`}
          data-tone={item.tone ?? "neutral"}
          {...stylex.props(
            band ? b.item : s.item,
            !band && compact && s.compactItem,
            !band && head && s.headItem,
            ledger && s.ledgerItem,
          )}
        >
          <dt
            {...stylex.props(
              band ? b.label : s.label,
              !band && compact && s.compactLabel,
              ledger && s.ledgerLabel,
            )}
          >
            {item.label}
          </dt>
          <dd
            {...stylex.props(
              band ? b.value : s.value,
              !band && compact && s.compactValue,
              !band && head && s.headValue,
              ledger && s.ledgerValue,
              item.tone === "good" && s.good,
              item.tone === "warn" && s.warn,
              item.tone === "error" && s.error,
            )}
          >
            {item.value}
          </dd>
          {item.caption && (
            <Caption
              {...stylex.props(
                band ? b.caption : s.caption,
                item.captionTone === "good" && s.good,
                item.captionTone === "warn" && s.warn,
                item.captionTone === "error" && s.error,
              )}
            >
              {item.caption}
            </Caption>
          )}
        </div>
      ))}
    </dl>
  );
}
