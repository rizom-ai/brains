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
  ASK_CLOSING_ATTRIBUTE,
  ASK_KEYBOARD_ATTRIBUTE,
  ASK_SHEET_ATTRIBUTE,
  ASK_SHEET_HISTORY_KEY,
  ASK_SHEET_MEDIA,
} from "@brains/contracts";
import {
  coverPage,
  lockPage,
  pageScroll,
  uncoverPage,
  unlockPage,
} from "./page-lock";

/** A visual viewport this much shorter than the window has a keyboard in it. */
const KEYBOARD_SHARE = 0.8;

export interface AskSheet {
  /** The screen is narrow enough for the box to open full screen. */
  narrow: boolean;
  open: boolean;
  show: () => void;
  close: () => void;
  /** A finger or pointer landed on the composer: where the page is now. */
  land: () => void;
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
  // A closing sheet stays open while it falls away (ASK_CLOSING_ATTRIBUTE).
  const [closing, setClosing] = useState(false);
  // Back closes the conversation: opening adds the history entry it pops.
  const entered = useRef(false);
  // Where the page was when a finger landed on the composer: Safari scrolls
  // a tapped field into view before it takes focus.
  const landed = useRef<number | null>(null);
  const land = useCallback((): void => {
    landed.current = window.scrollY;
  }, []);
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
    if (!window.matchMedia(ASK_SHEET_MEDIA).matches) return;
    // At once, as the boot does, before the keyboard moves anything.
    lockPage(landed.current);
    landed.current = null;
    setClosing(false);
    setOpen(true);
  }, []);

  const close = useCallback((): void => {
    setClosing(true);
    if (entered.current) {
      entered.current = false;
      window.history.back();
    }
  }, []);

  // The sheet closes once its fall ends; without one (reduced motion, or a
  // host without the box's stylesheet) at once.
  useLayoutEffect(() => {
    const element = host();
    if (!closing) return;
    const settle = (): void => {
      setClosing(false);
      setOpen(false);
    };
    if (!element) return settle();
    element.setAttribute(ASK_CLOSING_ATTRIBUTE, "");
    // The page shows again as the sheet starts to fall away from it.
    uncoverPage(element);
    const animation = window.getComputedStyle(element).animationName;
    if (!animation || animation === "none") return settle();
    element.addEventListener("animationend", settle, { once: true });
    return (): void => {
      element.removeEventListener("animationend", settle);
      element.removeAttribute(ASK_CLOSING_ATTRIBUTE);
    };
  }, [closing]);

  useLayoutEffect(() => {
    const element = host();
    if (!element) return;
    if (!open) {
      element.removeAttribute(ASK_SHEET_ATTRIBUTE);
      element.removeAttribute(ASK_KEYBOARD_ATTRIBUTE);
      return;
    }
    element.setAttribute(ASK_SHEET_ATTRIBUTE, "");
    lockPage();
    // Once the sheet has risen over the page, the page goes out of sight; a
    // sheet the boot opened may have risen already.
    let live = true;
    const cover = (): void => {
      if (live) coverPage(element);
    };
    const rising = "getAnimations" in element ? element.getAnimations() : [];
    if (rising.length === 0) cover();
    else
      void Promise.all(rising.map((rise) => rise.finished)).then(cover, cover);
    if (!entered.current) {
      entered.current = true;
      // Where the page was, so a reload with the sheet open returns there.
      window.history.pushState(
        { [ASK_SHEET_HISTORY_KEY]: { y: pageScroll() } },
        "",
      );
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
      setClosing(true);
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
      live = false;
      uncoverPage(element);
      unlockPage();
      element.removeAttribute(ASK_SHEET_ATTRIBUTE);
      element.removeAttribute(ASK_CLOSING_ATTRIBUTE);
      element.style.removeProperty("--ask-viewport-height");
      element.style.removeProperty("--ask-viewport-top");
      element.removeAttribute(ASK_KEYBOARD_ATTRIBUTE);
    };
  }, [open, close]);

  return { narrow, open, show, close, land };
}
