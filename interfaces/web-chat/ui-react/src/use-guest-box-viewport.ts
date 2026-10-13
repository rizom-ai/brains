import { useEffect, type RefObject } from "react";
import { ASK_SHEET_ATTRIBUTE } from "@brains/contracts";

/**
 * Keeps the host `.talk` panel sized to the visual viewport, so a phone's
 * on-screen keyboard shrinks the box instead of covering the composer, and
 * keeps the box in view while its composer has focus on a narrow screen.
 */
export function useGuestBoxViewport(
  root: RefObject<HTMLDivElement | null>,
  input: RefObject<HTMLTextAreaElement | null>,
): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = (): void => {
      root.current
        ?.closest<HTMLElement>(".talk")
        ?.style.setProperty(
          "--chat-viewport-height",
          `${viewport?.height ?? window.innerHeight}px`,
        );
      if (
        document.activeElement === input.current &&
        window.innerWidth <= 650 &&
        // A full-screen box already fits the viewport; the page is locked.
        !root.current?.closest(`[${ASK_SHEET_ATTRIBUTE}]`)
      )
        root.current?.scrollIntoView({ block: "end" });
    };
    resize();
    viewport?.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    return (): void => {
      viewport?.removeEventListener("resize", resize);
      window.removeEventListener("resize", resize);
    };
  }, []);
}
