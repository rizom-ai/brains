/** @jsxImportSource react */
import { Button } from "@brains/app-ui-react";
import type { ReactElement } from "react";
import type { StudioAskState } from "./app-view-props";
import { askStyles } from "./studio-ask-panel.styles";

/**
 * Opens Ask beside the entry. It sits in the document's head, and on a
 * phone in the bar below the writing, where the head has no room for it.
 */
export function StudioAskToggle(props: {
  ask: StudioAskState;
  placement: "head" | "bar";
}): ReactElement {
  return (
    <Button
      type="button"
      variant="ghost"
      xstyle={
        props.placement === "head" ? askStyles.toggleHead : askStyles.toggleBar
      }
      data-studio-ask-toggle={props.placement}
      aria-pressed={props.ask.open}
      aria-keyshortcuts="Control+j Meta+j"
      title="Ask about this entry (Ctrl+J or ⌘J)"
      onClick={() => props.ask.setOpen(!props.ask.open)}
    >
      Ask
    </Button>
  );
}
