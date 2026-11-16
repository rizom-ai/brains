/** @jsxImportSource react */
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { Window } from "happy-dom";
import type { FetchLike } from "@brains/utils/fetch-like";
import { App } from "./App";
import { StudioApi } from "./api";
import { createStudioQueryClient } from "./query-client";
import { StudioApiProvider } from "./studio-api-context";
import { createStudioRouter } from "./studio-router";
import { studioTypeHierarchy } from "../../src/config";

/**
 * Refining from the library, through the mounted app on a fake transport:
 * the row number is the mark a note is picked with, the page's one action
 * becomes Refine while notes are picked, one confirmation names them, and
 * Studio moves to where the refined note is being written.
 */

let restoreGlobals: RestoreGlobals;
let windowInstance: Window;
let root: Root;

interface Posted {
  path: string;
  body: unknown;
}

interface Server {
  refinable: boolean;
  posted: Posted[];
  /** What the refine route answers to a request with no approval. */
  ask: () => Response;
  refined: Record<string, unknown>[];
}

const capabilities = {
  canRead: true,
  canCreate: true,
  canUpdate: true,
  canDelete: true,
  canExtract: false,
  canPublish: false,
  canAssist: false,
};

const note = (id: string, title: string): Record<string, unknown> => ({
  id,
  entityType: "note",
  displayTitle: title,
  frontmatter: {},
  updated: "2026-11-15T10:00:00.000Z",
});

const notes = [
  note("dashboard-drop-off", "Onboarding call with Mira"),
  note("digest-numbers", "Weekly digest had a 31% open rate"),
  note("chat-prompts", "Chat prompts"),
];

const approval = { operation: { kind: "prompt-from-source" }, confirmed: true };

function fakeServer(server: Server): FetchLike {
  return async (input, init) => {
    const url = new URL(String(input), "http://brain.test");
    if (init?.method === "POST") {
      const body: unknown = JSON.parse(String(init.body));
      server.posted.push({ path: url.pathname, body });
      if (!url.pathname.endsWith("/refine")) return Response.json({});
      const approved =
        typeof body === "object" && body !== null && "approval" in body;
      if (!approved) return server.ask();
      server.refined = [
        {
          id: "dashboard-drop-off",
          entityType: "refined-note",
          frontmatter: { title: "dashboard-drop-off", status: "generating" },
          updated: "2026-11-16T10:00:00.000Z",
        },
      ];
      return Response.json({
        status: "queued",
        entityType: "refined-note",
        entityId: "dashboard-drop-off",
      });
    }
    if (url.pathname.endsWith("/types"))
      return Response.json({
        types: [
          {
            entityType: "note",
            label: "Notes",
            singularLabel: "Note",
            isSingleton: false,
            hasBody: true,
            count: notes.length,
            hierarchy: studioTypeHierarchy("note"),
            capabilities,
            ...(server.refinable && {
              refinesInto: {
                entityType: "refined-note",
                label: "Refined Note",
              },
            }),
          },
          {
            entityType: "refined-note",
            label: "Refined Notes",
            singularLabel: "Refined Note",
            isSingleton: false,
            hasBody: true,
            count: server.refined.length,
            hierarchy: studioTypeHierarchy("refined-note"),
            capabilities,
          },
        ],
        workspaces: [],
      });
    if (url.pathname.endsWith("/schema"))
      return Response.json({
        entityType: url.searchParams.get("type"),
        format: "frontmatter",
        isSingleton: false,
        hasBody: true,
        fields: [],
      });
    if (url.pathname.endsWith("/hierarchy")) {
      const entities =
        url.searchParams.get("type") === "note" ? notes : server.refined;
      return Response.json({ entities, folders: [], total: entities.length });
    }
    if (url.pathname.endsWith("/entities")) {
      // One entry, as the editor reads it when a title is opened.
      const id = url.searchParams.get("id");
      const found = notes.find((candidate) => candidate["id"] === id);
      return Response.json({ entity: { ...found, body: "" } });
    }
    return Response.json({ directorySync: null, git: null });
  };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

async function waitFor(
  predicate: () => boolean,
  attemptsLeft = 30,
): Promise<void> {
  if (predicate()) return;
  if (attemptsLeft === 0) {
    throw new Error(`Condition never held: ${document.body.textContent}`);
  }
  await settle();
  return waitFor(predicate, attemptsLeft - 1);
}

async function mount(server: Server): Promise<{
  history: ReturnType<typeof createMemoryHistory>;
}> {
  const api = new StudioApi({ basePath: "/studio", fetch: fakeServer(server) });
  const history = createMemoryHistory({
    initialEntries: ["/studio/entities/note"],
  });
  const router = createStudioRouter("/studio", App, history);
  await act(async () =>
    root.render(
      createElement(
        QueryClientProvider,
        { client: createStudioQueryClient() },
        createElement(
          StudioApiProvider,
          { api },
          createElement(RouterProvider, { router }),
        ),
      ),
    ),
  );
  await waitFor(
    () => document.querySelectorAll("[data-studio-record]").length === 3,
  );
  return { history };
}

function server(overrides: Partial<Server> = {}): Server {
  return {
    refinable: true,
    posted: [],
    ask: () =>
      Response.json({
        status: "confirm",
        summary: "Generate refined-note from two notes? They will be removed.",
        approval,
      }),
    refined: [],
    ...overrides,
  };
}

const marks = (): HTMLButtonElement[] => [
  ...document.querySelectorAll<HTMLButtonElement>("[data-studio-pick]"),
];

/** The mark on the row at this position. */
function mark(position: number): HTMLButtonElement {
  const found = marks()[position];
  if (!found) throw new Error(`No mark on row ${position}`);
  return found;
}

/** The entry of the row at this position: what opens it. */
function record(position: number): HTMLButtonElement {
  const found = document.querySelectorAll<HTMLButtonElement>(
    "[data-studio-record]",
  )[position];
  if (!found) throw new Error(`No entry on row ${position}`);
  return found;
}

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.textContent.trim() === label,
  );
  if (!found)
    throw new Error(`No "${label}" button: ${document.body.textContent}`);
  return found;
}

/** A button inside the open confirmation, which the page behind also has. */
function dialogButton(label: string): HTMLButtonElement {
  const found = [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[role="alertdialog"] button',
    ),
  ].find((candidate) => candidate.textContent.trim() === label);
  if (!found) throw new Error(`No "${label}" button in the dialog`);
  return found;
}

const hasButton = (label: string): boolean =>
  [...document.querySelectorAll("button")].some(
    (candidate) => candidate.textContent.trim() === label,
  );

async function click(element: HTMLElement): Promise<void> {
  await act(async () => element.click());
}

beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/studio" });
  restoreGlobals = installDomGlobals(windowInstance, {
    localStorage: windowInstance.localStorage,
    Event: windowInstance.Event,
    CustomEvent: windowInstance.CustomEvent,
    KeyboardEvent: windowInstance.KeyboardEvent,
    HTMLTextAreaElement: windowInstance.HTMLTextAreaElement,
    MutationObserver: windowInstance.MutationObserver,
    ResizeObserver: windowInstance.ResizeObserver,
    requestAnimationFrame:
      windowInstance.requestAnimationFrame.bind(windowInstance),
    cancelAnimationFrame:
      windowInstance.cancelAnimationFrame.bind(windowInstance),
    getComputedStyle: windowInstance.getComputedStyle.bind(windowInstance),
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restoreGlobals();
});

describe("a collection nothing refines", () => {
  it("has no marks, and its rows open as before", async () => {
    await mount(server({ refinable: false }));

    expect(marks()).toEqual([]);
    expect(hasButton("New note")).toBe(true);
  });
});

describe("picking notes in a collection that can be refined", () => {
  it("offers a mark on every row, named after its note, and nothing else at rest", async () => {
    await mount(server());

    expect(marks().map((mark) => mark.getAttribute("aria-label"))).toEqual([
      "Pick Onboarding call with Mira",
      "Pick Weekly digest had a 31% open rate",
      "Pick Chat prompts",
    ]);
    expect(marks().map((mark) => mark.getAttribute("aria-checked"))).toEqual([
      "false",
      "false",
      "false",
    ]);
    // The mark stands where the row's number stood.
    expect(marks()[0]?.textContent).toContain("01");
    expect(hasButton("New note")).toBe(true);
    expect(document.body.textContent).not.toContain("picked");
  });

  it("turns the page's one action into Refine while notes are picked", async () => {
    await mount(server());

    await click(mark(2));
    expect(hasButton("Refine note")).toBe(true);
    expect(hasButton("New note")).toBe(false);
    expect(document.body.textContent).toContain("1 picked of 3");

    await click(mark(0));
    expect(hasButton("Refine 2 notes")).toBe(true);
    expect(marks().map((mark) => mark.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
      "true",
    ]);
  });

  it("puts the list back on Cancel, and on unpicking the last note", async () => {
    await mount(server());

    await click(mark(0));
    await click(button("Cancel"));
    expect(hasButton("New note")).toBe(true);
    expect(document.body.textContent).not.toContain("picked");

    await click(mark(1));
    await click(mark(1));
    expect(hasButton("New note")).toBe(true);
  });

  it("still opens a note from its title while notes are picked", async () => {
    const { history } = await mount(server());

    await click(mark(0));
    await click(record(1));

    await waitFor(() => history.location.pathname.includes("/entities/note/"));
    expect(history.location.pathname).toEndWith(
      "/entities/note/digest-numbers",
    );
  });
});

describe("confirming a refine", () => {
  async function pickTwoAndAsk(state: Server): Promise<{
    history: ReturnType<typeof createMemoryHistory>;
  }> {
    const mounted = await mount(state);
    // Picked out of order; asked for in the order the list shows them.
    await click(mark(1));
    await click(mark(0));
    await click(button("Refine 2 notes"));
    await waitFor(
      () => document.querySelector('[role="alertdialog"]') !== null,
    );
    return mounted;
  }

  it("asks one question that names every note and says they will be removed", async () => {
    const state = server();
    await pickTwoAndAsk(state);

    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog?.textContent).toContain("Refine 2 notes into one?");
    expect(dialog?.textContent).toContain("Onboarding call with Mira");
    expect(dialog?.textContent).toContain("Weekly digest had a 31% open rate");
    expect(dialog?.textContent).toContain(
      "They will be removed once it is saved.",
    );
    expect(state.posted).toEqual([
      {
        path: "/studio/api/refine",
        body: {
          entityType: "note",
          ids: ["dashboard-drop-off", "digest-numbers"],
        },
      },
    ]);
  });

  it("runs it with the approval and the direction, then moves to where it is written", async () => {
    const state = server();
    const { history } = await pickTwoAndAsk(state);
    const direction = document.querySelector<HTMLTextAreaElement>(
      '[role="alertdialog"] textarea',
    );
    if (!direction) throw new Error("No direction field");
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        windowInstance.HTMLTextAreaElement.prototype,
        "value",
      )?.set?.call(direction, "Focus on pricing");
      direction.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await click(dialogButton("Refine"));

    await waitFor(() =>
      history.location.pathname.endsWith("/entities/refined-note"),
    );
    // The brain approves exactly what it was asked, so a direction stated
    // after the dialog opened is asked for before it is run.
    expect(state.posted.slice(1)).toEqual([
      {
        path: "/studio/api/refine",
        body: {
          entityType: "note",
          ids: ["dashboard-drop-off", "digest-numbers"],
          direction: "Focus on pricing",
        },
      },
      {
        path: "/studio/api/refine",
        body: {
          entityType: "note",
          ids: ["dashboard-drop-off", "digest-numbers"],
          direction: "Focus on pricing",
          approval,
        },
      },
    ]);
    await waitFor(() =>
      document.body.textContent.includes(
        "Refining 2 notes into one. They are removed once it is saved.",
      ),
    );
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("changes nothing on Cancel, and keeps the notes picked", async () => {
    const state = server();
    await pickTwoAndAsk(state);

    await click(dialogButton("Cancel"));

    await waitFor(
      () => document.querySelector('[role="alertdialog"]') === null,
    );
    expect(state.posted).toHaveLength(1);
    expect(hasButton("Refine 2 notes")).toBe(true);
  });

  it("says why when the brain refuses, and offers nothing to confirm", async () => {
    const state = server({
      ask: () =>
        Response.json(
          { error: "Deleting `note` requires Admin permission." },
          { status: 422 },
        ),
    });
    const mounted = await mount(state);
    await click(mark(0));
    await click(button("Refine note"));

    await waitFor(() =>
      document.body.textContent.includes(
        "Deleting `note` requires Admin permission.",
      ),
    );
    expect(hasButton("Refine")).toBe(false);
    expect(mounted.history.location.pathname).toBe("/studio/entities/note");
  });
});
