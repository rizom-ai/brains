import { useSyncExternalStore } from "react";

const KEY = "studio.navigation.collapsed";
const EVENT = "studio-navigation-preference";
const fallback = new WeakMap<Window, boolean>();

function snapshot(): boolean {
  if (typeof window === "undefined") return false;
  const current = fallback.get(window);
  if (current !== undefined) return current;
  try {
    return window.localStorage.getItem(KEY) === "true";
  } catch {
    // Storage may be blocked; default to expanded until a local choice is made.
    return fallback.get(window) ?? false;
  }
}

function subscribe(notify: () => void): () => void {
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== KEY && event.key !== null) return;
    fallback.delete(window);
    notify();
  };
  window.addEventListener(EVENT, notify);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, notify);
    window.removeEventListener("storage", onStorage);
  };
}

export function setStudioNavigationCollapsed(collapsed: boolean): void {
  fallback.set(window, collapsed);
  try {
    window.localStorage.setItem(KEY, String(collapsed));
  } catch {
    // Browsing still works when storage is unavailable.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** A shell preference, never a side effect of entering a destination/editor. */
export function useStudioNavigationCollapsed(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
