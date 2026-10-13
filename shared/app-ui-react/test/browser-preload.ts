import { Window } from "happy-dom";

/**
 * Radix decides once, when its modules first evaluate, whether it is running
 * in a browser — that choice picks `useLayoutEffect` over `useEffect` and
 * decides whether a dialog portals at all. Evaluate `../src` with no `window`
 * installed and every Radix control in the process is left in its server
 * shape, so a dialog opened later never appears in the document.
 *
 * A test file cannot own that, because whichever file imports the barrel first
 * wins and test files are ordered by the runner, not by us. So the window goes
 * up here, before any test module loads, and every file in this package
 * inherits a browser from the start.
 *
 * This install is deliberately never restored: it is the process's baseline,
 * not a test's. Tests still install their own per-test window over it and
 * restore back to this one — see `installDomGlobals` in `@brains/test-utils`.
 */
const bootstrapWindow = new Window({ url: "http://brain.test/" });
Object.assign(globalThis, {
  window: bootstrapWindow,
  document: bootstrapWindow.document,
});
