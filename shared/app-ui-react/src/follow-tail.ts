import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject, UIEvent } from "react";

/** How close to the end still counts as reading the latest content. */
export const FOLLOW_TAIL_THRESHOLD_PX = 48;

export interface FollowTailInput {
  /** Restores following whenever it changes, e.g. the open conversation. */
  resetKey: unknown;
  /** Any value that changes when the region gains content. */
  contentKey: unknown;
}

export interface FollowTail {
  ref: RefObject<HTMLDivElement | null>;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  /** True once the reader has scrolled away from the newest content. */
  awayFromLatest: boolean;
  jumpToLatest: () => void;
}

/**
 * Keeps a scroll region pinned to its newest content while the reader is at
 * the end, and stops following the moment they scroll up to read back.
 * Whether we are following is a ref rather than state: the scroll handler and
 * the observer both read it during layout, where a re-render would be too late.
 */
export function useFollowTail(input: FollowTailInput): FollowTail {
  const { resetKey, contentKey } = input;
  const ref = useRef<HTMLDivElement | null>(null);
  const followingRef = useRef(true);
  const [awayFromLatest, setAwayFromLatest] = useState(false);

  useEffect(() => {
    followingRef.current = true;
    setAwayFromLatest(false);
  }, [resetKey]);

  useEffect(() => {
    const scroll = ref.current;
    const content = scroll?.firstElementChild;
    if (!scroll || !content) return;
    const follow = (): void => {
      if (followingRef.current) scroll.scrollTop = scroll.scrollHeight;
    };
    follow();
    const observer = new ResizeObserver(follow);
    observer.observe(content);
    return (): void => observer.disconnect();
  }, []);

  useEffect(() => {
    if (followingRef.current) {
      const scroll = ref.current;
      if (scroll) scroll.scrollTop = scroll.scrollHeight;
    }
  }, [contentKey]);

  const onScroll = useCallback((event: UIEvent<HTMLDivElement>): void => {
    const scroll = event.currentTarget;
    const nearBottom =
      scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop <=
      FOLLOW_TAIL_THRESHOLD_PX;
    followingRef.current = nearBottom;
    setAwayFromLatest(!nearBottom);
  }, []);

  const jumpToLatest = useCallback((): void => {
    followingRef.current = true;
    setAwayFromLatest(false);
    const scroll = ref.current;
    if (scroll) {
      scroll.focus({ preventScroll: true });
      scroll.scrollTop = scroll.scrollHeight;
    }
  }, []);

  return { ref, onScroll, awayFromLatest, jumpToLatest };
}
