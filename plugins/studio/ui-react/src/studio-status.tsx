/** @jsxImportSource react */
import type { ReactElement, ReactNode } from "react";
import { editorClassName } from "./studio-editor.styles";
import { saveStyles as s } from "./studio-save.styles";
export function StudioStatus(props: {
  children: ReactNode;
  tone?: "error" | "good" | undefined;
  save?: boolean;
  inline?: boolean;
  className?: string;
}): ReactElement {
  const Element = props.inline ? "span" : "p";
  return (
    <Element
      data-studio-status={props.tone ?? "neutral"}
      role={props.tone === "error" ? "alert" : undefined}
      className={editorClassName(
        props.className ?? "",
        s.status,
        props.tone === "error" && s.error,
        props.tone === "good" && s.good,
        props.save && s.saveStatus,
        props.save && props.tone === "error" && s.saveError,
        props.save && props.tone === "good" && s.saveGood,
      )}
    >
      {props.children}
    </Element>
  );
}
