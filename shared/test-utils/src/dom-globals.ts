/**
 * Installing a global in a test is not a local act. Bun runs a package's test
 * files in one process, so a name assigned onto `globalThis` outlives the test
 * that set it and is still there when the next file runs — a file that never
 * imported it and cannot see why it broke. The failure lands far from its
 * cause: a test installs `File` from a DOM window, and uploads in another file
 * start failing inside a native `FormData` that will not take a foreign File.
 *
 * These install and hand back a `restore` that puts every name back exactly as
 * it was, including removing names that did not exist before. A test that
 * calls it in `afterEach` cannot leak into another file.
 *
 * Where a collaborator can be injected instead — a transport, a clock, a
 * client — inject it, and install nothing. These are for the names a library
 * reads off the global and gives you no seam for, which for React DOM under
 * happy-dom is `window`, `document` and their constructors.
 */

/** Undoes one install, restoring the previous values. Safe to call once. */
export type RestoreGlobals = () => void;

/**
 * Install `values` onto `globalThis` and return the undo.
 *
 * Nested installs of the same name unwind correctly as long as each restore
 * runs in reverse order, which `afterEach` gives you for free.
 */
export function installGlobals(
  values: Record<string, unknown>,
): RestoreGlobals {
  const previous = Object.keys(values).map((name) => ({
    name,
    existed: Object.hasOwn(globalThis, name),
    value: Reflect.get(globalThis, name),
  }));

  Object.assign(globalThis, values);

  return (): void => {
    for (const entry of previous) {
      if (entry.existed) Reflect.set(globalThis, entry.name, entry.value);
      else Reflect.deleteProperty(globalThis, entry.name);
    }
  };
}

/**
 * The window members a React DOM test installs. happy-dom's `Window` satisfies
 * this structurally, so nothing here depends on happy-dom itself.
 */
export interface TestDomWindow {
  readonly document: unknown;
  readonly navigator: unknown;
  readonly HTMLElement: unknown;
  readonly Element: unknown;
  readonly Node: unknown;
}

/**
 * Install the names React DOM needs from `window`, plus whatever `extras` this
 * test's subject reaches for — `ResizeObserver`, `getComputedStyle`, the event
 * constructors — and return the undo.
 *
 * Pass only the extras the subject actually uses. Installing a name nothing
 * needs is how an unrelated file ends up with a global it never asked for.
 */
export function installDomGlobals(
  window: TestDomWindow,
  extras: Record<string, unknown> = {},
): RestoreGlobals {
  return installGlobals({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
    ...extras,
  });
}
