/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactElement } from "react";
import { documentStyles as s } from "./operator-document.styles";
import { styledProps } from "./styled-props";
/** Compiled application-document slots for hosts that compose their own HTML. */
export function operatorApplicationDocumentClasses(): Record<
  "body" | "mount" | "boot",
  string
> {
  return {
    body: stylex.props(s.body, s.application).className ?? "",
    mount: stylex.props(s.mount).className ?? "",
    boot: stylex.props(s.boot).className ?? "",
  };
}
/** Native console body. Hosts own the document and climate selection. */
export function OperatorDocumentBody(
  props: ComponentProps<"body">,
): ReactElement {
  return <body {...styledProps(props, s.body)} />;
}
