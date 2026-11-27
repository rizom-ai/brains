/** The parts of a click that say whether the browser should handle it. */
export interface LinkClick {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * A plain primary click on a Studio link navigates in place. Any modifier or
 * other button is the browser's: a new tab, a new window or a download.
 */
export function isPlainLinkClick(event: LinkClick): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}
