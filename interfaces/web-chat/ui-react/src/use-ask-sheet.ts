import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  ASK_BOX_ATTRIBUTE,
  ASK_KEYBOARD_ATTRIBUTE,
  ASK_SHEET_ATTRIBUTE,
  ASK_SHEET_MEDIA,
} from "@brains/contracts";

/** A visual viewport this much shorter than the window has a keyboard in it. */
const KEYBOARD_SHARE = 0.8;

export interface AskSheet {
  /** The screen is narrow enough for the box to open full screen. */
  narrow: boolean;
  open: boolean;
  show: () => void;
  close: () => void;
}

/**
 * The box full screen on a phone (see `@brains/contracts` ask-box). While
 * open it marks its host, fits the visual viewport so the composer rides on
 * the keyboard, locks the page behind it, and closes with Back or Escape.
 */
export function useAskSheet(
  root: RefObject<HTMLElement | null>,
  input: RefObject<HTMLTextAreaElement | null>,
): AskSheet {
  const [narrow, setNarrow] = useState(
    () => window.matchMedia(ASK_SHEET_MEDIA).matches,
  );
  const [open, setOpen] = useState(false);
  // Back closes the conversation: opening adds the history entry it pops.
  const entered = useRef(false);
  const host = (): HTMLElement | null =>
    root.current?.closest<HTMLElement>(`[${ASK_BOX_ATTRIBUTE}]`) ?? null;

  // Layout effects: a sheet the boot opened never paints closed in between.
  useLayoutEffect(() => {
    const query = window.matchMedia(ASK_SHEET_MEDIA);
    const change = (): void => setNarrow(query.matches);
    query.addEventListener("change", change);
    // The boot opens the sheet on engagement, before the box has mounted.
    if (query.matches && host()?.hasAttribute(ASK_SHEET_ATTRIBUTE))
      setOpen(true);
    return (): void => query.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    if (!narrow) setOpen(false);
  }, [narrow]);

  const show = useCallback((): void => {
    if (window.matchMedia(ASK_SHEET_MEDIA).matches) setOpen(true);
  }, []);

  const close = useCallback((): void => {
    setOpen(false);
    if (entered.current) {
      entered.current = false;
      window.history.back();
    }
  }, []);

  useLayoutEffect(() => {
    const element = host();
    if (!element) return;
    if (!open) {
      element.removeAttribute(ASK_SHEET_ATTRIBUTE);
      element.removeAttribute(ASK_KEYBOARD_ATTRIBUTE);
      return;
    }
    element.setAttribute(ASK_SHEET_ATTRIBUTE, "");
    const page = document.documentElement;
    const scroll = page.style.overflow;
    page.style.overflow = "hidden";
    if (!entered.current) {
      entered.current = true;
      window.history.pushState(window.history.state, "");
    }
    const viewport = window.visualViewport;
    const fit = (): void => {
      const height = viewport?.height ?? window.innerHeight;
      element.style.setProperty("--ask-viewport-height", `${height}px`);
      element.style.setProperty(
        "--ask-viewport-top",
        `${viewport?.offsetTop ?? 0}px`,
      );
      element.toggleAttribute(
        ASK_KEYBOARD_ATTRIBUTE,
        document.activeElement === input.current &&
          height < window.innerHeight * KEYBOARD_SHARE,
      );
    };
    const back = (): void => {
      entered.current = false;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close();
    };
    fit();
    viewport?.addEventListener("resize", fit);
    viewport?.addEventListener("scroll", fit);
    window.addEventListener("resize", fit);
    document.addEventListener("focusin", fit);
    document.addEventListener("focusout", fit);
    window.addEventListener("popstate", back);
    document.addEventListener("keydown", escape);
    return (): void => {
      viewport?.removeEventListener("resize", fit);
      viewport?.removeEventListener("scroll", fit);
      window.removeEventListener("resize", fit);
      document.removeEventListener("focusin", fit);
      document.removeEventListener("focusout", fit);
      window.removeEventListener("popstate", back);
      document.removeEventListener("keydown", escape);
      page.style.overflow = scroll;
      element.removeAttribute(ASK_SHEET_ATTRIBUTE);
      element.style.removeProperty("--ask-viewport-height");
      element.style.removeProperty("--ask-viewport-top");
      element.removeAttribute(ASK_KEYBOARD_ATTRIBUTE);
    };
  }, [open, close]);

  return { narrow, open, show, close };
}
