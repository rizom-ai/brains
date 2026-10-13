/** @jsxImportSource react */
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@brains/app-ui-react";
import type { Dispatch, ReactElement, SetStateAction } from "react";
import type { MobileEditorPane } from "./app-view-props";
import type { BodyMode } from "./body-editor";
import {
  editorClassName as editorClass,
  editorStyles,
} from "./studio-editor.styles";
import { typographyStyles } from "./studio-typography.styles";

/** The split editor's phone panes, in menu order. */
const EDITOR_PANES: readonly MobileEditorPane[] = [
  "details",
  "write",
  "preview",
];

const EDITOR_PANE_LABELS: Record<MobileEditorPane, string> = {
  details: "Properties",
  write: "Source",
  preview: "Preview",
};

/** The body mode each body pane shows; Properties leaves the body alone. */
const PANE_BODY_MODES: Partial<Record<MobileEditorPane, BodyMode>> = {
  write: "source",
  preview: "preview",
};

/** Chooses which pane of the split editor a phone shows. */
export function StudioEditorPaneMenu(props: {
  pane: MobileEditorPane;
  hasBody: boolean;
  onPane: (pane: MobileEditorPane) => void;
  onBodyMode: Dispatch<SetStateAction<BodyMode>>;
}): ReactElement {
  return (
    <div
      className={editorClass("studio-mobile-tabs", editorStyles.mobileModes)}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Editor view"
            className={editorClass(
              "",
              editorStyles.paneTrigger,
              typographyStyles.eyebrow,
            )}
          >
            {EDITOR_PANE_LABELS[props.pane]}
            <span aria-hidden="true">⌄</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {EDITOR_PANES.map((pane) => (
            <DropdownMenuItem
              key={pane}
              disabled={pane !== "details" && !props.hasBody}
              onSelect={() => {
                props.onPane(pane);
                const bodyMode = PANE_BODY_MODES[pane];
                if (bodyMode) props.onBodyMode(bodyMode);
              }}
            >
              {EDITOR_PANE_LABELS[pane]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
