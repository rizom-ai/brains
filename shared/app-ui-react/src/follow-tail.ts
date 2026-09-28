import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject, UIEvent } from "react";

/** How close to the end still counts as reading the latest content. */
export const FOLLOW_TAIL_THRESHOLD_PX = 48;

export interface FollowTailInput {
  /** Restores following whenever it changes, e.g. the open conversation. */
  resetKey: unknown;
  /** Any value that changes when the region gains content. */
  contentKey: unknown;
  /**
   * Holds the region still, e.g. while it shows something other than the
   * content. Resuming does not scroll by itself: the owner may be restoring
   * its own reading position, and the next content change follows again.
   */
  paused?: boolean | undefined;
}

export interface FollowTail {
  ref: RefObject<HTMLDivElement | null>;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  /** True once the reader has scrolled away from the newest content. */
  awayFromLatest: boolean;
  /** Resume following; the next content change scrolls to the newest. */
  follow: () => void;
  jumpToLatest: () => void;
  /**
   * Show the region from this element, e.g. a question whose answer just
   * arrived, and stop following until the reader returns to the end.
   */
  showFrom: (element: HTMLElement) => void;
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

/**
 * Keeps a scroll region pinned to its newest content while the reader is at
 * the end, and stops following the moment they scroll up to read back.
 * Whether we are following is a ref rather than state: the scroll handler and
 * the observer both read it during layout, where a re-render would be too late.
 */
export function useFollowTail(input: FollowTailInput): FollowTail {
  const { resetKey, contentKey, paused = false } = input;
  const ref = useRef<HTMLDivElement | null>(null);
  const followingRef = useRef(true);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const [awayFromLatest, setAwayFromLatest] = useState(false);

  useEffect(() => {
    followingRef.current = true;
    setAwayFromLatest(false);
  }, [resetKey]);

  // Every item in the region can grow (an answer, or something a host docks
  // at its top), and items come and go; each is watched while it is there.
  useEffect(() => {
    const scroll = ref.current;
    if (!scroll) return;
    const follow = (): void => {
      if (followingRef.current && !pausedRef.current)
        scroll.scrollTop = scroll.scrollHeight;
    };
    follow();
    const observer = new ResizeObserver(follow);
    Array.from(scroll.children).forEach((item) => observer.observe(item));
    const added =
      typeof MutationObserver === "function"
        ? new MutationObserver((records) => {
            for (const record of records) {
              record.removedNodes.forEach((node) => {
                if (isElement(node)) observer.unobserve(node);
              });
              record.addedNodes.forEach((node) => {
                if (isElement(node)) observer.observe(node);
              });
            }
          })
        : undefined;
    added?.observe(scroll, { childList: true });
    return (): void => {
      observer.disconnect();
      added?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (followingRef.current && !pausedRef.current) {
      const scroll = ref.current;
      if (scroll) scroll.scrollTop = scroll.scrollHeight;
    }
  }, [contentKey]);

  const onScroll = useCallback((event: UIEvent<HTMLDivElement>): void => {
    if (pausedRef.current) return;
    const scroll = event.currentTarget;
    const nearBottom =
      scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop <=
      FOLLOW_TAIL_THRESHOLD_PX;
    followingRef.current = nearBottom;
    setAwayFromLatest(!nearBottom);
  }, []);

  const follow = useCallback((): void => {
    followingRef.current = true;
    setAwayFromLatest(false);
  }, []);

  const jumpToLatest = useCallback((): void => {
    follow();
    const scroll = ref.current;
    if (scroll) {
      scroll.focus({ preventScroll: true });
      scroll.scrollTop = scroll.scrollHeight;
    }
  }, [follow]);

  const showFrom = useCallback((element: HTMLElement): void => {
    const scroll = ref.current;
    if (!scroll) return;
    followingRef.current = false;
    setAwayFromLatest(true);
    // Below whatever covers the region's top, as its scroll padding says.
    const style = scroll.ownerDocument.defaultView?.getComputedStyle(scroll);
    const covered = parseFloat(style?.scrollPaddingTop ?? "") || 0;
    scroll.scrollTop +=
      element.getBoundingClientRect().top -
      scroll.getBoundingClientRect().top -
      covered;
  }, []);

  return { ref, onScroll, awayFromLatest, follow, jumpToLatest, showFrom };
}
