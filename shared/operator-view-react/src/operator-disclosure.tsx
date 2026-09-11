/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { disclosureStyles as s } from "./operator-disclosure.styles";
import { actionLayoutStyles } from "./operator-action-layout.styles";

/** Native disclosure state and events stay with the browser or controlling host. */
export function OperatorDisclosure(
  props: ComponentProps<"details"> & {
    triggerLabel: ReactNode;
    presentation?: "action" | undefined;
    triggerVariant?: "outline" | "link" | undefined;
  },
): ReactElement {
  const {
    triggerLabel,
    presentation,
    triggerVariant,
    children,
    ...attributes
  } = props;
  const css = stylex.props(presentation === "action" && s.action);
  return (
    <details
      {...attributes}
      {...css}
      className={[attributes.className, css.className]
        .filter(Boolean)
        .join(" ")}
    >
      <summary
        {...stylex.props(
          (presentation === "action" || triggerVariant === "outline") &&
            s.trigger,
          triggerVariant === "link" && [actionLayoutStyles.link, s.link],
        )}
      >
        {triggerLabel}
      </summary>
      {children}
    </details>
  );
}
