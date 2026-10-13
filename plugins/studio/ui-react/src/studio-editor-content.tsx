/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import {
  useLayoutEffect,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";
import type { StudioEditorPresentation } from "./entity-fields";
import { editorLayoutStyles as layout } from "./studio-editor-layout.styles";
import { editorContentStyles as content } from "./studio-editor-content.styles";

export function revealStudioProperties(form: HTMLFormElement): void {
  // Native invalid events precede focus/reportValidity. Opening the existing
  // disclosure preserves controls and drafts; no pane is remounted.
  const disclosure = form.querySelector("details[data-studio-properties]");
  disclosure?.setAttribute("open", "");
}

export function StudioEditorContent({
  presentation,
  children,
}: {
  presentation: StudioEditorPresentation;
  children: ReactNode;
}): ReactElement {
  return presentation === "split" ? (
    <>{children}</>
  ) : (
    <div
      data-studio-editor-content=""
      role="region"
      aria-label="Record contents"
      tabIndex={0}
      {...stylex.props(content.content)}
    >
      {children}
    </div>
  );
}

export function StudioEditorProperties({
  presentation,
  reveal,
  children,
  summaryDescription,
}: {
  presentation: StudioEditorPresentation;
  reveal: boolean;
  children: ReactNode;
  summaryDescription?: string | undefined;
}): ReactElement {
  const ref = useRef<HTMLDetailsElement>(null);
  useLayoutEffect(() => {
    // Open before child field effects try to focus a validation error.
    // Structured server validation must also reveal errors in collapsed fields.
    // Clearing errors never closes a disclosure the user opened.
    if (reveal && ref.current) ref.current.open = true;
  }, [reveal]);
  if (presentation === "document")
    return (
      <details
        ref={ref}
        data-studio-properties=""
        {...stylex.props(content.disclosure)}
      >
        <summary {...stylex.props(content.summary)}>
          Properties
          {summaryDescription && (
            <span {...stylex.props(content.summaryDescription)}>
              {summaryDescription}
            </span>
          )}
        </summary>
        <div {...stylex.props(content.disclosedFields)}>{children}</div>
      </details>
    );
  return (
    <aside
      data-studio-properties=""
      {...stylex.props(
        layout.colophon,
        presentation === "form" && layout.fullWidthProperties,
        presentation === "form" && content.properties,
      )}
    >
      {children}
    </aside>
  );
}
