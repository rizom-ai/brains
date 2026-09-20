import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject, UIEvent } from "react";

/** How close to the end still counts as reading the latest message. */
const FOLLOW_LATEST_THRESHOLD_PX = 48;

export interface ChatThreadScrollInput {
  /** Restores following whenever the open conversation changes. */
  sessionId: string | null;
  /** Any value that changes when the thread gains content. */
  contentKey: unknown;
}

export interface ChatThreadScroll {
  threadScrollRef: RefObject<HTMLDivElement | null>;
  onThreadScroll: (event: UIEvent<HTMLDivElement>) => void;
  /** True once the reader has scrolled away from the newest message. */
  showJumpToLatest: boolean;
  jumpToLatest: () => void;
}

/**
 * Keeps the thread pinned to the newest message while the reader is at the
 * end, and stops following the moment they scroll up to read back. Whether we
 * are following is a ref rather than state: the scroll handler and the
 * observer both read it during layout, where a re-render would be too late.
 */
export function useChatThreadScroll(
  input: ChatThreadScrollInput,
): ChatThreadScroll {
  const { sessionId, contentKey } = input;
  const threadScrollRef = useRef<HTMLDivElement | null>(null);
  const followLatestRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  useEffect(() => {
    followLatestRef.current = true;
    setShowJumpToLatest(false);
  }, [sessionId]);

  useEffect(() => {
    const scroll = threadScrollRef.current;
    const manuscript = scroll?.firstElementChild;
    if (!scroll || !manuscript) return;
    const follow = (): void => {
      if (followLatestRef.current) scroll.scrollTop = scroll.scrollHeight;
    };
    follow();
    const observer = new ResizeObserver(follow);
    observer.observe(manuscript);
    return (): void => observer.disconnect();
  }, []);

  useEffect(() => {
    if (followLatestRef.current) {
      const scroll = threadScrollRef.current;
      if (scroll) scroll.scrollTop = scroll.scrollHeight;
    }
  }, [contentKey]);

  const onThreadScroll = useCallback((event: UIEvent<HTMLDivElement>): void => {
    const scroll = event.currentTarget;
    const nearBottom =
      scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop <=
      FOLLOW_LATEST_THRESHOLD_PX;
    followLatestRef.current = nearBottom;
    setShowJumpToLatest(!nearBottom);
  }, []);

  const jumpToLatest = useCallback((): void => {
    followLatestRef.current = true;
    setShowJumpToLatest(false);
    const scroll = threadScrollRef.current;
    if (scroll) {
      scroll.focus({ preventScroll: true });
      scroll.scrollTop = scroll.scrollHeight;
    }
  }, []);

  return { threadScrollRef, onThreadScroll, showJumpToLatest, jumpToLatest };
}
