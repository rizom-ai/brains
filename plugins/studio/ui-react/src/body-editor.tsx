/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { bodyStyles as s } from "./studio-body.styles";
import { Tabs, TabsList, TabsTrigger } from "@brains/app-ui-react";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import {
  Annotation,
  Compartment,
  EditorState,
  type Extension,
} from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactElement,
} from "react";
import { StudioMarkdown } from "./studio-markdown";

export type BodyMode = "source" | "split" | "preview";
const BODY_MODES: readonly BodyMode[] = ["source", "split", "preview"];

function isBodyMode(value: string): value is BodyMode {
  return value === "source" || value === "split" || value === "preview";
}
const BODY_MODE_LABELS: Record<BodyMode, string> = {
  source: "Source",
  split: "Split",
  preview: "Preview",
};

const externalDocumentSync = Annotation.define<boolean>();

// Source reads like the document it makes: headings at their size in the
// display face, emphasis as emphasis, and only code in monospace.
const studioMarkdownHighlightStyle = HighlightStyle.define([
  {
    tag: tags.heading1,
    fontFamily: "var(--console-display)",
    fontSize: "1.75em",
    fontWeight: "600",
    color: "var(--console-text)",
  },
  {
    tag: tags.heading2,
    fontFamily: "var(--console-display)",
    fontSize: "1.4em",
    fontWeight: "600",
    color: "var(--console-text)",
  },
  {
    tag: tags.heading3,
    fontFamily: "var(--console-display)",
    fontSize: "1.18em",
    fontWeight: "600",
    color: "var(--console-text)",
  },
  { tag: tags.heading, color: "var(--console-text)", fontWeight: "600" },
  {
    tag: tags.monospace,
    fontFamily: "var(--console-mono)",
    fontSize: "0.86em",
  },
  { tag: tags.meta, color: "var(--console-text-muted)" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "600" },
  {
    tag: [tags.link, tags.url],
    color: "var(--console-text)",
    textDecoration: "underline",
  },
  { tag: tags.quote, color: "var(--console-text-dim)" },
]);

const bodyEditorBaseExtensions: Extension[] = [
  markdown(),
  syntaxHighlighting(studioMarkdownHighlightStyle),
  EditorView.lineWrapping,
  EditorView.contentAttributes.of({
    "aria-label": "Markdown source",
    tabindex: "0",
  }),
];

export interface SelectionRange {
  from: number;
  to: number;
}

export function createBodyEditorState(
  value: string,
  extensions: Extension[] = [],
): EditorState {
  return EditorState.create({
    doc: value,
    extensions: [...bodyEditorBaseExtensions, ...extensions],
  });
}

function replaceBodyEditorDocument(view: EditorView, value: string): void {
  const current = view.state.doc.toString();
  if (current === value) return;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: value },
    annotations: externalDocumentSync.of(true),
  });
}

function CodeMirrorBodySource(props: {
  value: string;
  onChange: (value: string) => void;
  onSelectionChange?: (selection: SelectionRange | null) => void;
  readOnly: boolean;
}): ReactElement {
  const { value, onChange, onSelectionChange, readOnly } = props;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const initialValueRef = useRef(value);
  const initialReadOnlyRef = useRef(readOnly);
  const readOnlyCompartmentRef = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onSelectionChangeRef = useRef(onSelectionChange);

  const publishSelection = useCallback((view: EditorView): void => {
    const range = view.state.selection.main;
    onSelectionChangeRef.current?.(
      range.empty ? null : { from: range.from, to: range.to },
    );
  }, []);

  useEffect(() => {
    onChangeRef.current = onChange;
    onSelectionChangeRef.current = onSelectionChange;
  }, [onChange, onSelectionChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view = new EditorView({
      parent: host,
      state: createBodyEditorState(initialValueRef.current, [
        readOnlyCompartmentRef.current.of([
          EditorState.readOnly.of(initialReadOnlyRef.current),
          EditorView.editable.of(!initialReadOnlyRef.current),
        ]),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (!update.docChanged) return;
          if (
            update.transactions.some(
              (transaction): boolean =>
                transaction.annotation(externalDocumentSync) === true,
            )
          ) {
            return;
          }
          onChangeRef.current(update.state.doc.toString());
        }),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (!update.selectionSet && !update.docChanged) return;
          publishSelection(update.view);
        }),
        EditorView.domEventHandlers({
          keyup: (_event, view): false => {
            publishSelection(view);
            return false;
          },
          mouseup: (_event, view): false => {
            window.setTimeout(() => publishSelection(view), 0);
            return false;
          },
          touchend: (_event, view): false => {
            window.setTimeout(() => publishSelection(view), 0);
            return false;
          },
        }),
      ]),
    });
    viewRef.current = view;

    return (): void => {
      view.destroy();
      if (viewRef.current === view) viewRef.current = null;
    };
  }, [publishSelection]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    replaceBodyEditorDocument(view, value);
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartmentRef.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);

  return (
    // CodeMirror's editable content carries the "Markdown source" name; a
    // name on this host div, which has no role, is not allowed.
    <div ref={hostRef} {...stylex.props(s.source)} data-editor="codemirror6" />
  );
}

/**
 * Markdown body editor: CodeMirror 6 edits the literal bytes beside a
 * streamdown preview, behind a Source | Split | Preview segment control.
 */
export function BodyEditor(props: {
  value: string;
  mode: BodyMode;
  onChange: (value: string) => void;
  onModeChange: (mode: BodyMode) => void;
  /** The passage selected in the source, for Ask to be about. */
  onSelectionChange?:
    | ((selection: { from: number; to: number; text: string } | null) => void)
    | undefined;
  readOnly?: boolean;
  /** Stacked editors own their mode controls at every viewport width. */
  singlePane?: boolean;
  /** The document's title, which its preview need not repeat. */
  documentTitle?: string | undefined;
}): ReactElement {
  const {
    value,
    mode: requestedMode,
    onChange,
    onModeChange,
    onSelectionChange,
    readOnly = false,
    singlePane = false,
  } = props;
  const mode =
    singlePane && requestedMode === "split"
      ? readOnly
        ? "preview"
        : "source"
      : requestedMode;
  const panelId = useId();
  const showSource = mode !== "preview";
  const showPreview = mode !== "source";
  return (
    <div {...stylex.props(s.root)}>
      <header {...stylex.props(s.toolbar)}>
        <Tabs
          value={mode}
          onValueChange={(value) => {
            if (isBodyMode(value)) onModeChange(value);
          }}
        >
          <TabsList
            {...stylex.props(s.modes, singlePane && s.inlineModes)}
            aria-label="Editor body view"
          >
            {BODY_MODES.filter(
              (candidate) => !singlePane || candidate !== "split",
            ).map((candidate) => (
              <TabsTrigger
                key={candidate}
                value={candidate}
                id={`${panelId}-${candidate}`}
                aria-controls={panelId}
              >
                {BODY_MODE_LABELS[candidate]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <span {...stylex.props(s.metadata)}>
          {value.trim() ? value.trim().split(/\s+/).length.toLocaleString() : 0}{" "}
          words
        </span>
      </header>
      <div
        {...stylex.props(s.panes, showSource && showPreview && s.split)}
        data-studio-split={showSource && showPreview ? "" : undefined}
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${panelId}-${mode}`}
      >
        {showSource && (
          <CodeMirrorBodySource
            value={value}
            onChange={onChange}
            onSelectionChange={(range) =>
              onSelectionChange?.(
                range
                  ? { ...range, text: value.slice(range.from, range.to) }
                  : null,
              )
            }
            readOnly={readOnly}
          />
        )}
        {showPreview && (
          <div
            {...stylex.props(s.preview)}
            data-studio-preview=""
            tabIndex={0}
            role="region"
            aria-label="Rendered document"
          >
            <StudioMarkdown
              presentation="document"
              documentTitle={props.documentTitle}
            >
              {value}
            </StudioMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
