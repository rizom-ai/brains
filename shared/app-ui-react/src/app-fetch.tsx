/** @jsxImportSource react */
import {
  createContext,
  useContext,
  type ReactElement,
  type ReactNode,
} from "react";

/** The shape of `fetch` a React tree can be handed in place of the global. */
export type AppFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/**
 * The transport the API calls under this tree go through.
 *
 * Production provides none and every client falls back to the global fetch,
 * exactly as before. A test wraps the tree in `AppFetchProvider` with a fake
 * and reads the requests off it, rather than reassigning `globalThis.fetch`.
 *
 * That distinction is not stylistic. Bun runs a package's test files in one
 * process, so a reassigned global outlives the test that set it unless every
 * path restores it, and a test that forgets breaks a file it never imported.
 * An injected transport cannot reach past the tree it was given to.
 */
const AppFetchContext = createContext<AppFetch | undefined>(undefined);

export function AppFetchProvider(props: {
  fetch: AppFetch;
  children?: ReactNode | undefined;
}): ReactElement {
  return (
    <AppFetchContext.Provider value={props.fetch}>
      {props.children}
    </AppFetchContext.Provider>
  );
}

/** The transport for this tree, or undefined where none was provided. */
export function useAppFetch(): AppFetch | undefined {
  return useContext(AppFetchContext);
}
