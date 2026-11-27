/** @jsxImportSource react */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@brains/app-ui-react";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useState, type ReactElement } from "react";
import { shortcutStyles } from "./studio-shortcuts.styles";

const SHORTCUTS: ReadonlyArray<readonly [keys: string, action: string]> = [
  ["Ctrl+S or ⌘S", "Save changes"],
  ["Ctrl+\\ or ⌘\\", "Show or hide Details"],
  ["Ctrl+K or ⌘K", "Search or do anything"],
  ["?", "Show these shortcuts"],
];

const styles = shortcutStyles;

/** Whether a key press belongs to what is being typed. */
function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/** ? opens the editor's keyboard shortcuts, unless it is being typed. */
export function StudioShortcuts(): ReactElement {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "?" || typing(event.target)) return;
      event.preventDefault();
      setOpen(true);
    };
    document.addEventListener("keydown", onKey);
    return (): void => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>While an entry is open.</DialogDescription>
        </DialogHeader>
        <dl {...stylex.props(styles.list)}>
          {SHORTCUTS.map(([keys, action]) => (
            <div key={action} {...stylex.props(styles.row)}>
              <dt {...stylex.props(styles.keys)}>{keys}</dt>
              <dd {...stylex.props(styles.action)}>{action}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
