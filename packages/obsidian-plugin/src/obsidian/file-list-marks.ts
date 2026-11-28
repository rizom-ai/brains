import type { App } from "obsidian";
import type { ExplorerMark } from "./explorer-marks";

/** The attribute a marked row of the file list carries; the mark is drawn in CSS. */
const MARK_ATTRIBUTE = "data-rizom-brain-mark";
const ROWS = ".nav-file-title[data-path], .nav-folder-title[data-path]";

/**
 * The marks beside names in Obsidian's file list. Obsidian has no API for
 * the list, so its rows are found by the path each carries and given an
 * attribute; the list draws only the rows on screen, so the marks are put
 * on again whenever it draws others.
 */
export class FileListMarks {
  private readonly app: App;
  private marks: Readonly<Record<string, ExplorerMark>> = {};
  private readonly watched = new Map<HTMLElement, MutationObserver>();
  private painting = false;

  constructor(app: App) {
    this.app = app;
  }

  /** Show these marks, and keep showing them as the list is drawn. */
  show(marks: Readonly<Record<string, ExplorerMark>>): void {
    this.marks = marks;
    this.watch();
    this.paint();
  }

  /** Take every mark away and stop watching the list. */
  clear(): void {
    this.marks = {};
    for (const [container, observer] of this.watched) {
      observer.disconnect();
      this.paintIn(container);
    }
    this.watched.clear();
  }

  /** Watch each file list that is open now; one closed since is let go. */
  private watch(): void {
    const open = new Set(
      this.app.workspace
        .getLeavesOfType("file-explorer")
        .map((leaf) => leaf.view.containerEl),
    );
    for (const [container, observer] of this.watched) {
      if (open.has(container)) continue;
      observer.disconnect();
      this.watched.delete(container);
    }
    for (const container of open) {
      if (this.watched.has(container)) continue;
      const observer = new MutationObserver(() => this.paintSoon());
      observer.observe(container, { childList: true, subtree: true });
      this.watched.set(container, observer);
    }
  }

  /** Once per frame, however many rows the list drew. */
  private paintSoon(): void {
    if (this.painting) return;
    this.painting = true;
    window.requestAnimationFrame(() => {
      this.painting = false;
      this.paint();
    });
  }

  private paint(): void {
    for (const container of this.watched.keys()) this.paintIn(container);
  }

  private paintIn(container: HTMLElement): void {
    for (const row of Array.from(container.querySelectorAll(ROWS))) {
      const path = row.getAttribute("data-path");
      const mark = path === null ? undefined : this.marks[path];
      if (mark === undefined) row.removeAttribute(MARK_ATTRIBUTE);
      else if (row.getAttribute(MARK_ATTRIBUTE) !== mark) {
        row.setAttribute(MARK_ATTRIBUTE, mark);
      }
    }
  }
}
