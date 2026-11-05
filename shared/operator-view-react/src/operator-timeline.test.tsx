/** @jsxImportSource react */
import type { RuntimeStudioWorkspaceData } from "@brains/plugins";
import { afterEach, describe, expect, it } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { OperatorViewRenderer } from "./operator-view-renderer";

const data: RuntimeStudioWorkspaceData = {
  view: {
    blocks: [
      {
        type: "timeline",
        id: "day",
        label: "Last 24 hours",
        start: "2026-07-10T16:40:00.000Z",
        end: "2026-07-11T16:40:00.000Z",
        legend: [
          { label: "Done", tone: "good" },
          { label: "Failed", tone: "error" },
        ],
        items: [
          {
            id: "light-recent",
            at: "2026-07-11T16:28:00.000Z",
            title: "Quiet infrastructure updated",
            target: "row-recent",
          },
          {
            id: "light-midway",
            at: "2026-07-11T04:40:00.000Z",
            title: "Search index refreshed",
            tone: "good",
          },
          {
            id: "light-before",
            at: "2026-07-10T15:00:00.000Z",
            title: "Outside the window",
          },
        ],
      },
      {
        type: "list",
        id: "log",
        empty: "Nothing happened.",
        items: [{ id: "row-recent", title: "Quiet infrastructure" }],
      },
    ],
  },
};

function render(): string {
  return renderToStaticMarkup(
    <OperatorViewRenderer
      data={data}
      onAction={async () => ({})}
      onOpenEntity={() => {}}
      renderHead={false}
    />,
  );
}

describe("timeline block", () => {
  it("places each event in its window as a labelled light", () => {
    const html = render();

    expect(html).toMatch(/<section[^>]*aria-label="Last 24 hours"/);
    expect(html).toContain("2 events");
    expect(html).not.toContain("Outside the window");
    expect(html).toMatch(
      /aria-label="\d{2}:\d{2} Search index refreshed"[^>]*style="left:calc\(18px \+ \(100% - 36px\) \* 0\.5\)/,
    );
    expect(html).toMatch(/data-tone="good"[^>]*aria-label="[^"]*Search index/);
    expect(html.match(/data-timeline-tick=""/g)).toHaveLength(4);
    expect(html).toContain("Done");
    expect(html).toContain("Failed");
  });

  it("marks a list row as the subject of the light that names it", () => {
    expect(render()).toContain('data-row-id="row-recent"');
  });
});

describe("timeline block in the browser", () => {
  let restoreGlobals: RestoreGlobals | undefined;
  let windowInstance: Window | undefined;
  let root: Root | undefined;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    await windowInstance?.happyDOM.abort();
    windowInstance?.close();
    restoreGlobals?.();
  });

  it("highlights the row a light points at when the light is chosen", async () => {
    windowInstance = new Window({ url: "https://brain.test/studio" });
    restoreGlobals = installDomGlobals(windowInstance, {
      Event: windowInstance.Event,
      MutationObserver: windowInstance.MutationObserver,
      getComputedStyle: windowInstance.getComputedStyle.bind(windowInstance),
      matchMedia: windowInstance.matchMedia.bind(windowInstance),
    });
    const container = document.createElement("div");
    document.body.append(container);
    const created = createRoot(container);
    root = created;
    await act(async () =>
      created.render(
        <OperatorViewRenderer
          data={data}
          onAction={async () => ({})}
          onOpenEntity={() => {}}
          renderHead={false}
        />,
      ),
    );
    const light = container.querySelector<HTMLButtonElement>(
      'button[aria-label$="Quiet infrastructure updated"]',
    );
    if (!light) throw new Error("Expected a light for the recent event");

    await act(async () => light.click());

    expect(
      container
        .querySelector('[data-row-id="row-recent"]')
        ?.hasAttribute("data-timeline-active"),
    ).toBe(true);
    expect(light.getAttribute("aria-pressed")).toBe("true");
  });
});
