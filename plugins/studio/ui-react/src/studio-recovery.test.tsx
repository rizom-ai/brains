/** @jsxImportSource react */
import { afterEach, beforeEach, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StudioApi, type EntityDetail } from "./api";
import { StudioApiProvider } from "./studio-api-context";
const bootstrapWindow = new Window();
Object.assign(globalThis, {
  window: bootstrapWindow,
  document: bootstrapWindow.document,
});
const { StudioConflictRecovery, rescueVersion } =
  await import("./studio-conflict-recovery");
const { editorSaveLabel } = await import("./editor-status");
await bootstrapWindow.happyDOM.close();

let windowInstance: Window;
let root: Root;
beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/studio" });
  Object.assign(globalThis, {
    window: windowInstance,
    document: windowInstance.document,
    navigator: windowInstance.navigator,
    HTMLElement: windowInstance.HTMLElement,
    HTMLInputElement: windowInstance.HTMLInputElement,
    Element: windowInstance.Element,
    Node: windowInstance.Node,
    NodeFilter: windowInstance.NodeFilter,
    Event: windowInstance.Event,
    CustomEvent: windowInstance.CustomEvent,
    MutationObserver: windowInstance.MutationObserver,
    ResizeObserver: windowInstance.ResizeObserver,
    getComputedStyle: windowInstance.getComputedStyle.bind(windowInstance),
    requestAnimationFrame:
      windowInstance.requestAnimationFrame.bind(windowInstance),
    cancelAnimationFrame:
      windowInstance.cancelAnimationFrame.bind(windowInstance),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  windowInstance.close();
});
async function click(text: string): Promise<void> {
  const button = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === text,
  );
  if (!button) throw new Error(`Missing button: ${text}`);
  await act(async () => button.click());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

it("describes save state without confusing dirty edits with a previous successful save", () => {
  expect(editorSaveLabel({ kind: "saved" }, true)).toBe("Unsaved changes");
  expect(editorSaveLabel({ kind: "idle" }, false)).toBe("Saved");
  expect(editorSaveLabel({ kind: "saving" }, true)).toBe("Saving…");
  expect(editorSaveLabel({ kind: "error", message: "Failed" }, true)).toContain(
    "Save failed",
  );
  expect(
    editorSaveLabel({ kind: "conflict", message: "Changed" }, true),
  ).toContain("Conflict");
});

it("keeps a lossless rescue copy of both properties and body", () => {
  const frontmatter = { title: "Local draft", visibility: "restricted" };
  const body = "# Text\n\nUnicode: café\n";
  expect(JSON.parse(rescueVersion(frontmatter, body))).toEqual({
    frontmatter,
    body,
  });
});

it("preserves the draft after a failed comparison and replaces it only after explicit confirmation", async () => {
  // Radix captures DOM availability at import time. Other Studio tests import
  // it for SSR before creating a window, so run this portal interaction in a
  // fresh process whose DOM bootstrap precedes those imports.
  if (process.env["STUDIO_RECOVERY_TEST_CHILD"] !== "1") {
    const child = Bun.spawn(
      [
        "bun",
        "test",
        "--preload",
        "@brains/build-tools/stylex-test-preload",
        import.meta.path,
      ],
      {
        env: { ...process.env, STUDIO_RECOVERY_TEST_CHILD: "1" },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (code !== 0)
      throw new Error(`Recovery interaction failed:\n${stdout}\n${stderr}`);
    expect(code).toBe(0);
    return;
  }
  const original: EntityDetail = {
    id: "note-1",
    entityType: "note",
    frontmatter: { visibility: "public" },
    body: "Original",
    contentHash: "old",
    created: "2026-09-11T00:00:00Z",
    updated: "2026-09-11T00:00:00Z",
  };
  const latest = { ...original, body: "Remote changes", contentHash: "new" };
  let reads = 0;
  const replacements: EntityDetail[] = [];
  const api = new StudioApi({
    basePath: "/studio",
    fetch: Object.assign(
      async () => {
        reads += 1;
        return reads === 1
          ? new Response("Unavailable", { status: 503 })
          : Response.json({ entity: latest });
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
  });
  await act(async () =>
    root.render(
      createElement(
        StudioApiProvider,
        { api },
        createElement(StudioConflictRecovery, {
          entity: original,
          draft: { visibility: "restricted" },
          body: "My unsaved changes",
          onUseLatest: (entity) => replacements.push(entity),
        }),
      ),
    ),
  );
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
  await click("Copy my version");
  expect(document.body.textContent).toContain("Copy unavailable");
  expect(document.querySelector("textarea")?.value).toContain(
    "My unsaved changes",
  );
  expect(reads).toBe(0);
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="Close"]')?.click(),
  );
  await click("Compare changes");
  expect(document.querySelector("[role=alert]")).not.toBeNull();
  expect(document.querySelector("textarea")?.value).toContain(
    "My unsaved changes",
  );
  expect(replacements).toHaveLength(0);
  await click("Retry latest");
  expect([...document.querySelectorAll("textarea")][1]?.value).toContain(
    "Remote changes",
  );
  await click("Use latest version");
  expect(replacements).toHaveLength(0);
  await click("Keep my draft");
  expect(replacements).toHaveLength(0);
  await click("Use latest version");
  await click("Replace with latest");
  expect(replacements).toEqual([latest]);
  expect(reads).toBe(2);
});
