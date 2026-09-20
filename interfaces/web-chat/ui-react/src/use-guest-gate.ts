import { useCallback, useRef, useState } from "react";
import type { RefObject } from "react";
import type { GuestBoxState } from "./GuestBox";

export interface GuestGate {
  busy: boolean;
  status: string;
  boxState: GuestBoxState;
  boxNotice: string | undefined;
  setStatus: (value: string) => void;
  setBoxState: (value: GuestBoxState) => void;
  setBoxNotice: (value: string | undefined) => void;
  /** False once the component has unmounted; async work must check it. */
  mounted: RefObject<boolean>;
  /**
   * Whether something already holds the gate.
   *
   * `run` answers this too, but an operation whose own guards have visible
   * effects — reporting an expired session, say — must ask before reaching
   * them, so that being refused stays silent.
   */
  locked: () => boolean;
  /**
   * Run `work` if nothing else holds the gate. A refused call does nothing at
   * all — it is not queued, and the caller is not told, because every caller
   * here is a visitor action that must not stack up behind another.
   */
  run: (
    work: () => Promise<void>,
    onError?: (cause: unknown) => void,
  ) => Promise<void>;
  /**
   * Run the one operation that starts already holding the gate: opening the
   * session at mount. The page is busy from its first paint, so this releases
   * rather than acquires.
   */
  runBoot: (
    work: () => Promise<void>,
    onError?: (cause: unknown) => void,
  ) => Promise<void>;
}

/**
 * One visitor operation at a time.
 *
 * Sending, restoring, deleting, checking history and reopening a session all
 * move the same conversation, and several of them are not safe to interleave —
 * a delete racing a send decides nothing good. A single lock is what makes
 * that true, so it lives here rather than in each operation's own hook, and
 * the operations take this gate as an input.
 *
 * The lock is a ref, not state: `run` must see the current value synchronously
 * at the moment it is called, and a re-render is neither needed nor wanted.
 * `busy` is the rendered shadow of it.
 */
export function useGuestGate(): GuestGate {
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState("Connecting…");
  const [boxState, setBoxState] = useState<GuestBoxState>("connecting");
  const [boxNotice, setBoxNotice] = useState<string>();
  // Held from mount: the session is not open yet, so nothing may run.
  const lock = useRef(true);
  const mounted = useRef(true);

  const release = useCallback((): void => {
    lock.current = false;
    if (mounted.current) setBusy(false);
  }, []);

  const runBoot = useCallback(
    async (
      work: () => Promise<void>,
      onError?: (cause: unknown) => void,
    ): Promise<void> => {
      try {
        await work();
      } catch (cause) {
        onError?.(cause);
      } finally {
        release();
      }
    },
    [release],
  );

  const run = useCallback(
    async (
      work: () => Promise<void>,
      onError?: (cause: unknown) => void,
    ): Promise<void> => {
      if (lock.current) return;
      lock.current = true;
      setBusy(true);
      await runBoot(work, onError);
    },
    [runBoot],
  );

  const locked = useCallback((): boolean => lock.current, []);

  return {
    busy,
    status,
    boxState,
    boxNotice,
    setStatus,
    setBoxState,
    setBoxNotice,
    mounted,
    locked,
    run,
    runBoot,
  };
}
