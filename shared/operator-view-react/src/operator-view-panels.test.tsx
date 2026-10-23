/** @jsxImportSource react */
import type {
  RuntimeOperatorActionControl,
  RuntimeOperatorLaunchIntent,
  RuntimeStudioOperatorPanelBlock,
} from "@brains/plugins";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Window } from "happy-dom";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import type { OperatorViewQuery, RuntimeBlock } from "./operator-view-host";
import { ViewBlock } from "./operator-view-panels";

/** One panel per handler, labelled by the container that holds it. */
function panels(id: string): RuntimeStudioOperatorPanelBlock[] {
  return [
    { type: "action", actionId: `run-${id}`, label: `Run ${id}`, input: {} },
    {
      type: "links",
      items: [
        {
          label: `Launch ${id}`,
          target: { kind: "launch", launch: { target: "publishing" } },
        },
        {
          label: `Open ${id}`,
          target: { kind: "entity", entityType: "note", id },
        },
      ],
    },
    {
      type: "query",
      id: `query-${id}`,
      controls: [],
      pagination: { offset: 0, limit: 1, total: 2, label: `Next ${id}` },
    },
  ];
}

interface Calls {
  actions: string[];
  entities: string[];
  launches: RuntimeOperatorLaunchIntent[];
  queries: OperatorViewQuery[];
}

describe("ViewBlock", () => {
  let restoreGlobals: RestoreGlobals;
  let windowInstance: Window;
  let root: Root;
  let container: HTMLElement;

  beforeEach(() => {
    windowInstance = new Window({ url: "https://brain.test/studio" });
    restoreGlobals = installDomGlobals(windowInstance, {
      Event: windowInstance.Event,
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    await windowInstance.happyDOM.abort();
    windowInstance.close();
    restoreGlobals();
  });

  const render = async (
    blocks: readonly RuntimeBlock[],
    query: OperatorViewQuery = {},
  ): Promise<Calls> => {
    const calls: Calls = {
      actions: [],
      entities: [],
      launches: [],
      queries: [],
    };
    const onAction = async (
      action: RuntimeOperatorActionControl,
    ): Promise<unknown> => {
      calls.actions.push(action.actionId);
      return undefined;
    };
    await act(async () => {
      root.render(
        <>
          {blocks.map((block, index) => (
            <ViewBlock
              key={index}
              block={block}
              onAction={onAction}
              onOpenEntity={(entityType, id) =>
                calls.entities.push(`${entityType}:${id}`)
              }
              onLaunch={(launch) => calls.launches.push(launch)}
              query={query}
              onQueryChange={(next) => calls.queries.push(next)}
            />
          ))}
        </>,
      );
    });
    return calls;
  };

  const click = async (label: string): Promise<void> => {
    const button = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((candidate) => String(candidate.textContent).trim() === label);
    if (!button) throw new Error(`Expected a "${label}" button`);
    await act(async () => button.click());
  };

  /** Every handler reaches the panels a container holds. */
  const expectWired = async (
    calls: Calls,
    id: string,
    query: OperatorViewQuery,
  ): Promise<void> => {
    for (const recorded of Object.values(calls)) recorded.length = 0;
    await click(`Run ${id}`);
    await click(`Launch ${id}`);
    await click(`Open ${id}`);
    await click(`Next ${id}`);
    expect(calls).toEqual({
      actions: [`run-${id}`],
      entities: [`note:${id}`],
      launches: [{ target: "publishing" }],
      queries: [{ ...query, offset: 1, limit: 1 }],
    });
  };

  it("wires every handler into a bare panel", async () => {
    const calls = await render(panels("bare"));

    expect(container.querySelector("[data-columns]")).toBeNull();
    expect(container.querySelector("[data-card]")).toBeNull();
    await expectWired(calls, "bare", {});
  });

  it("wires every handler into a card's panels", async () => {
    const calls = await render([
      { type: "card", id: "card", label: "Card", blocks: panels("card") },
    ]);

    expect(container.querySelector("[data-card]")).not.toBeNull();
    expect(container.textContent).toContain("Card");
    await expectWired(calls, "card", {});
  });

  it("wires every handler into both column regions", async () => {
    const calls = await render([
      {
        type: "columns",
        id: "columns",
        primary: [
          {
            type: "card",
            id: "primary",
            label: "Primary",
            blocks: panels("primary"),
          },
        ],
        aside: panels("aside"),
      },
    ]);

    expect(container.querySelector("[data-columns]")).not.toBeNull();
    expect(container.querySelector("[data-card]")).not.toBeNull();
    await expectWired(calls, "primary", {});
    await expectWired(calls, "aside", {});
  });

  it("wires every handler into an open detail and keeps its query", async () => {
    const query = { selected: "row-1" };
    const calls = await render(
      [
        {
          type: "detail",
          id: "detail",
          queryKey: "selected",
          empty: "Select a row.",
          master: {
            type: "table",
            id: "rows",
            empty: "No rows.",
            columns: [{ key: "title", label: "Title" }],
            rows: [{ id: "row-1", cells: { title: "First row" } }],
          },
          open: { forId: "row-1", title: "Row one", blocks: panels("detail") },
        },
      ],
      query,
    );

    expect(
      container.querySelector('[data-detail][data-open="true"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("Row one");
    await expectWired(calls, "detail", query);
    await click("← Back");
    expect(calls.queries.at(-1)).toEqual({});
  });

  it("wires every handler into the active tab's blocks", async () => {
    const calls = await render([
      {
        type: "tabs",
        id: "tabs",
        label: "Views",
        defaultTab: "first",
        tabs: [{ id: "first", label: "First", blocks: panels("tab") }],
      },
    ]);

    expect(container.querySelector("[data-tabs]")).not.toBeNull();
    await expectWired(calls, "tab", {});
  });
});
