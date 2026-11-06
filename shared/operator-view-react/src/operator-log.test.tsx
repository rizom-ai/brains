/** @jsxImportSource react */
import type { RuntimeStudioWorkspaceData } from "@brains/plugins";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OperatorViewRenderer } from "./operator-view-renderer";

const NOW = Date.parse("2026-07-11T16:40:00.000Z");
const realNow = Date.now;

function render(data: RuntimeStudioWorkspaceData): string {
  return renderToStaticMarkup(
    <OperatorViewRenderer
      data={data}
      onAction={async () => ({})}
      onOpenEntity={() => {}}
      onLaunch={() => {}}
      renderHead={false}
    />,
  );
}

describe("log and attention list presentations", () => {
  beforeEach(() => {
    Date.now = (): number => NOW;
  });
  afterEach(() => {
    Date.now = realNow;
  });

  it("groups a log by time of day and leads each row with its clock time", () => {
    const html = render({
      view: {
        blocks: [
          {
            type: "list",
            id: "log",
            presentation: "log",
            empty: "Nothing happened.",
            items: [
              {
                id: "recent",
                at: "2026-07-11T16:28:00.000Z",
                title: "Quiet infrastructure",
                metadata: ["Note updated"],
              },
              {
                id: "morning",
                at: "2026-07-11T09:12:00.000Z",
                title: "Directory sync completed",
                tone: "good",
              },
              {
                id: "last-night",
                at: "2026-07-10T20:40:00.000Z",
                title: "Weekly digest drafted",
              },
            ],
          },
        ],
      },
    });

    const headings = [...html.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map(
      (match) => match[1],
    );
    expect(headings).toEqual(["This hour", "Earlier today", "Yesterday"]);
    expect(html).toMatch(
      /data-row-id="recent"[^>]*>.*?<time[^>]*datetime="2026-07-11T16:28:00.000Z"[^>]*>\d{2}:\d{2}<\/time>.*?Quiet infrastructure.*?Note updated/is,
    );
    expect(html.indexOf("Weekly digest drafted")).toBeGreaterThan(
      html.indexOf("Directory sync completed"),
    );
  });

  it("leads attention rows with their source and offers their links as buttons", () => {
    const html = render({
      view: {
        blocks: [
          {
            type: "list",
            id: "needs",
            presentation: "attention",
            empty: "Nothing needs you.",
            items: [
              {
                id: "build",
                title: "Site build failed",
                description: "The render stopped.",
                metadata: ["Site", "2 items"],
                tone: "error",
                links: [
                  {
                    label: "Open site",
                    target: { kind: "launch", launch: { target: "site" } },
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(html.indexOf("2 items")).toBeLessThan(
      html.indexOf("Site build failed"),
    );
    expect(html).toMatch(/data-variant="outline"[^>]*>Open site</);
  });
});

describe("attention rail", () => {
  it("rails only rows that wait on the operator", () => {
    const html = render({
      view: {
        blocks: [
          {
            type: "list",
            id: "needs",
            presentation: "attention",
            empty: "Nothing needs you.",
            items: [
              { id: "failed", title: "Build failed", tone: "error" },
              { id: "blocked", title: "Blocked card" },
            ],
          },
        ],
      },
    });
    const rowClass = (id: string): string =>
      new RegExp(`class="([^"]*)"[^>]*data-row-id="${id}"`).exec(html)?.[1] ??
      "";

    expect(rowClass("failed")).not.toBe(rowClass("blocked"));
    expect(rowClass("failed").split(" ").length).toBeGreaterThan(
      rowClass("blocked").split(" ").length,
    );
  });
});
