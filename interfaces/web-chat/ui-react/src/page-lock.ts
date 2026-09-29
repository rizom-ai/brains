import { ASK_PAGE_LOCK_ATTRIBUTE } from "@brains/contracts";

/**
 * Holds the page still behind an open sheet (ASK_PAGE_LOCK_ATTRIBUTE in the
 * ask-box contract). Safari scrolls a page whose root only hides its
 * overflow, both when a field takes focus and under a swipe, so the body is
 * pinned in place at the page's scroll position and goes back there on
 * release. The box boot does the same when it opens the sheet before the
 * box mounts; whichever comes first holds the lock.
 */
const PINNED = ["position", "top", "left", "right"] as const;

/** At the given scroll position, or where the page is now. */
export function lockPage(at: number | null = null): void {
  const root = document.documentElement;
  if (root.hasAttribute(ASK_PAGE_LOCK_ATTRIBUTE)) return;
  const y = Math.round(at ?? window.scrollY);
  root.setAttribute(ASK_PAGE_LOCK_ATTRIBUTE, String(y));
  const body = document.body.style;
  body.position = "fixed";
  body.top = `${-y}px`;
  body.left = "0";
  body.right = "0";
}

export function unlockPage(): void {
  const root = document.documentElement;
  const held = root.getAttribute(ASK_PAGE_LOCK_ATTRIBUTE);
  if (held === null) return;
  root.removeAttribute(ASK_PAGE_LOCK_ATTRIBUTE);
  for (const property of PINNED) document.body.style.removeProperty(property);
  window.scrollTo(0, Number(held) || 0);
}

/** Where the page is, locked or not. */
export function pageScroll(): number {
  const held = document.documentElement.getAttribute(ASK_PAGE_LOCK_ATTRIBUTE);
  return held === null ? Math.round(window.scrollY) : Number(held) || 0;
}

/**
 * Takes everything on the page but the open sheet out of sight, so nothing
 * of it can show through wherever the sheet briefly fails to cover the
 * screen (as Safari's keyboard and bars resize it). The sheet stays visible.
 */
export function coverPage(sheet: HTMLElement): void {
  document.body.style.visibility = "hidden";
  sheet.style.visibility = "visible";
}

export function uncoverPage(sheet: HTMLElement): void {
  document.body.style.removeProperty("visibility");
  sheet.style.removeProperty("visibility");
}
