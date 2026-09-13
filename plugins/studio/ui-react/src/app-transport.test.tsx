/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { Window } from "happy-dom";
import type { FetchLike } from "@brains/utils/fetch-like";
import { App } from "./App";
import { StudioApi, type ValidationIssue } from "./api";
import { Field } from "./entity-fields";
import { SaveStateNotice } from "./editor-status";
import { createStudioQueryClient } from "./query-client";
import { StudioApiProvider } from "./studio-api-context";
import { createStudioRouter } from "./studio-router";

let windowInstance: Window;
let root: Root;
let requests: string[];

// Everything the mounted App asks for goes through here, so the requests it
// makes are readable without touching the global fetch.
const recordingFetch: FetchLike = (input) => {
  const url = String(input);
  requests.push(url);
  if (url === "/studio/api/types") {
    return Promise.resolve(
      Response.json({
        types: [{ entityType: "post", label: "Posts", isSingleton: false }],
        workspaces: [],
      }),
    );
  }
  return Promise.resolve(Response.json({}, { status: 404 }));
};

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

async function waitFor(
  predicate: () => boolean,
  attemptsLeft = 20,
): Promise<void> {
  if (predicate()) return;
  if (attemptsLeft === 0) {
    throw new Error(
      `Condition never held; requests seen: ${JSON.stringify(requests)}`,
    );
  }
  await settle();
  return waitFor(predicate, attemptsLeft - 1);
}

beforeEach(() => {
  windowInstance = new Window({ url: "http://brain.test/studio" });
  requests = [];
  Object.assign(globalThis, {
    window: windowInstance,
    document: windowInstance.document,
    localStorage: windowInstance.localStorage,
    navigator: windowInstance.navigator,
    HTMLElement: windowInstance.HTMLElement,
    Element: windowInstance.Element,
    Node: windowInstance.Node,
    Event: windowInstance.Event,
    CustomEvent: windowInstance.CustomEvent,
    MutationObserver: windowInstance.MutationObserver,
    ResizeObserver: windowInstance.ResizeObserver,
    requestAnimationFrame:
      windowInstance.requestAnimationFrame.bind(windowInstance),
    cancelAnimationFrame:
      windowInstance.cancelAnimationFrame.bind(windowInstance),
    getComputedStyle: windowInstance.getComputedStyle.bind(windowInstance),
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

describe("Studio App transport", () => {
  it.each([
    [401, "no longer authenticated"],
    [403, "permission"],
    [404, "unavailable"],
    [503, "could not load"],
  ] as const)(
    "distinguishes a failed navigation read (%s) from an empty collection",
    async (status, message) => {
      let recovered = false;
      const methods: string[] = [];
      const api = new StudioApi({
        basePath: "/studio",
        fetch: async (input, init): Promise<Response> => {
          methods.push(init?.method ?? "GET");
          if (String(input).endsWith("/types"))
            return recovered
              ? Response.json({ types: [], workspaces: [] })
              : Response.json({ error: "Read failed" }, { status });
          return Response.json({ directorySync: false, git: null });
        },
      });
      const client = createStudioQueryClient();
      const router = createStudioRouter(
        "/studio",
        App,
        createMemoryHistory({ initialEntries: ["/studio"] }),
      );
      await act(async () =>
        root.render(
          <QueryClientProvider client={client}>
            <StudioApiProvider api={api}>
              <RouterProvider router={router} />
            </StudioApiProvider>
          </QueryClientProvider>,
        ),
      );
      await waitFor(() => document.body.textContent.includes(message));
      expect(document.body.textContent).not.toContain(
        "No readable collections",
      );
      recovered = true;
      await act(async () => {
        [...document.querySelectorAll("button")]
          .find((button) => button.textContent === "Retry")
          ?.click();
      });
      await waitFor(() =>
        document.body.textContent.includes("No readable collections"),
      );
      expect(methods.every((method) => method === "GET")).toBe(true);
      client.clear();
    },
  );

  it("keeps an unavailable destination distinct from an empty account and offers a return", async () => {
    const api = new StudioApi({
      basePath: "/studio",
      fetch: async (input): Promise<Response> =>
        Response.json(
          String(input).endsWith("/types")
            ? { types: [], workspaces: [] }
            : { directorySync: false, git: null },
        ),
    });
    const history = createMemoryHistory({
      initialEntries: ["/studio/entities/missing"],
    });
    const router = createStudioRouter("/studio", App, history);
    const client = createStudioQueryClient();
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <StudioApiProvider api={api}>
            <RouterProvider router={router} />
          </StudioApiProvider>
        </QueryClientProvider>,
      ),
    );
    await waitFor(() =>
      document.body.textContent.includes("Collection unavailable"),
    );
    expect(document.body.textContent).not.toContain("No readable collections");
    await act(async () => {
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent === "Open Studio")
        ?.click();
    });
    await waitFor(() =>
      document.body.textContent.includes("No readable collections"),
    );
    expect(history.location.pathname).toBe("/studio");
    client.clear();
  });
  it("associates server errors with fields and focuses only the first rejected field", async () => {
    const issues: ValidationIssue[] = [
      { path: ["title"], message: "Use a shorter title" },
      { path: [], message: "Check the record settings" },
    ];
    const render = (title: string): void =>
      root.render(
        <form>
          <Field
            descriptor={{
              name: "title",
              label: "Title",
              widget: "string",
              required: true,
            }}
            value={title}
            issues={issues}
            onChange={() => {}}
          />
          <Field
            descriptor={{
              name: "slug",
              label: "Slug",
              widget: "string",
              required: true,
            }}
            value="slug"
            issues={issues}
            onChange={() => {}}
          />
          <SaveStateNotice
            state={{ kind: "error", message: "Invalid frontmatter", issues }}
          />
        </form>,
      );
    await act(async () => render("My draft"));
    const title = document.querySelector<HTMLInputElement>(
      '[aria-invalid="true"]',
    );
    expect(document.activeElement).toBe(title);
    expect(
      document.getElementById(title?.getAttribute("aria-describedby") ?? "")
        ?.textContent,
    ).toContain("Use a shorter title");
    expect(title?.value).toBe("My draft");
    expect(document.body.textContent).toContain("Check the record settings");
    const slug = document.querySelectorAll("input")[1];
    if (!slug) throw new Error("Missing slug input");
    slug.focus();
    await act(async () => render("Corrected draft"));
    expect(document.activeElement).toBe(slug);
  });

  it("reveals and focuses validation errors that have no editable field", async () => {
    await act(async () =>
      root.render(
        <form>
          <SaveStateNotice
            state={{
              kind: "error",
              message: "Invalid record",
              issues: [
                {
                  path: [],
                  message: "Choose a supported record configuration",
                },
              ],
            }}
          />
        </form>,
      ),
    );
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Save failed",
    );
    expect(document.querySelector("details")?.open).toBe(true);
    expect(document.body.textContent).toContain(
      "Choose a supported record configuration",
    );
  });

  it.each([200, 422])(
    "does not apply a late save response (%s) to another record",
    async (status) => {
      const pending = { resolve: (_response: Response): void => {} };
      let saves = 0;
      const makeEntity = (id: string): Record<string, unknown> => ({
        id,
        entityType: "post",
        frontmatter: { title: id },
        body: "",
        contentHash: id,
        created: "2026-09-11T00:00:00Z",
        updated: "2026-09-11T00:00:00Z",
      });
      const api = new StudioApi({
        basePath: "/studio",
        fetch: async (input, init): Promise<Response> => {
          const url = new URL(String(input), "http://brain.test");
          if (init?.method === "PUT") {
            saves += 1;
            return new Promise<Response>((resolve) => {
              pending.resolve = resolve;
            });
          }
          if (url.pathname.endsWith("/types"))
            return Response.json({
              types: [
                {
                  entityType: "post",
                  label: "Posts",
                  count: 2,
                  isSingleton: false,
                  hasBody: false,
                  capabilities: {
                    canRead: true,
                    canUpdate: true,
                    canCreate: false,
                    canDelete: false,
                    canAssist: false,
                    canPublish: false,
                    canExtract: false,
                  },
                },
              ],
              workspaces: [],
            });
          if (url.pathname.endsWith("/schema"))
            return Response.json({
              entityType: "post",
              format: "frontmatter",
              isSingleton: false,
              hasBody: false,
              fields: [
                {
                  name: "title",
                  label: "Title",
                  widget: "string",
                  required: true,
                },
              ],
            });
          if (url.pathname.endsWith("/entities"))
            return Response.json(
              url.searchParams.has("id")
                ? { entity: makeEntity(url.searchParams.get("id") ?? "first") }
                : {
                    entities: [makeEntity("first"), makeEntity("second")],
                    total: 2,
                  },
            );
          return Response.json({ directorySync: false, git: null });
        },
      });
      const history = createMemoryHistory({
        initialEntries: ["/studio/entities/post/first"],
      });
      const router = createStudioRouter("/studio", App, history);
      const client = createStudioQueryClient();
      await act(async () =>
        root.render(
          <QueryClientProvider client={client}>
            <StudioApiProvider api={api}>
              <RouterProvider router={router} />
            </StudioApiProvider>
          </QueryClientProvider>,
        ),
      );
      await waitFor(() => document.querySelector("input")?.value === "first");
      await act(async () => {
        document
          .querySelector("form")
          ?.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          );
      });
      await waitFor(() => saves === 1);
      await act(async () => history.push("/studio/entities/post/second"));
      await waitFor(() => document.querySelector("input")?.value === "second");
      await act(async () =>
        pending.resolve(
          Response.json(
            status === 200
              ? { entityId: "first", jobId: "saved-first" }
              : {
                  error: "Invalid first record",
                  issues: [
                    { path: ["title"], message: "First title rejected" },
                  ],
                },
            { status },
          ),
        ),
      );
      await settle();
      expect(history.location.pathname).toBe("/studio/entities/post/second");
      expect(document.querySelector("input")?.value).toBe("second");
      expect(document.querySelector('[data-studio-status="error"]')).toBeNull();
      client.clear();
    },
  );

  it("retains a failed image for explicit retry without replacing the previous reference", async () => {
    let uploads = 0;
    const changes: unknown[] = [];
    const api = new StudioApi({
      basePath: "/studio",
      fetch: async (): Promise<Response> => {
        uploads += 1;
        return uploads === 1
          ? Response.json({ error: "Connection interrupted" }, { status: 503 })
          : Response.json({ entityId: "new-image" });
      },
    });
    const client = createStudioQueryClient();
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <StudioApiProvider api={api}>
            <Field
              descriptor={{ name: "cover", label: "Cover", widget: "image" }}
              value="old-image"
              onChange={(value) => changes.push(value)}
            />
          </StudioApiProvider>
        </QueryClientProvider>,
      ),
    );
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("Missing upload input");
    Object.defineProperty(input, "files", {
      value: [new File(["image"], "cover.png", { type: "image/png" })],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor(() =>
      document.body.textContent.includes("Connection interrupted"),
    );
    expect(changes).toEqual([]);
    expect(document.body.textContent).toContain("old-image");
    expect(document.body.textContent).toContain("cover.png");
    const retry = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Retry upload",
    );
    await act(async () => {
      retry?.click();
      retry?.click();
    });
    await waitFor(() => changes.length === 1);
    expect(changes).toEqual(["new-image"]);
    expect(uploads).toBe(2);
    expect(document.body.textContent).toContain(
      "Save changes to keep this reference",
    );
    client.clear();
  });

  it("does not apply a late image upload after switching records", async () => {
    const pending = { resolve: (_response: Response): void => {} };
    const changes: unknown[] = [];
    const api = new StudioApi({
      basePath: "/studio",
      fetch: (): Promise<Response> =>
        new Promise<Response>((resolve) => {
          pending.resolve = resolve;
        }),
    });
    const client = createStudioQueryClient();
    const render = (record: string): void =>
      root.render(
        <QueryClientProvider client={client}>
          <StudioApiProvider api={api}>
            <Field
              key={record}
              descriptor={{ name: "cover", label: "Cover", widget: "image" }}
              value={record}
              onChange={(value) => changes.push(value)}
            />
          </StudioApiProvider>
        </QueryClientProvider>,
      );
    await act(async () => render("first"));
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("Missing upload input");
    Object.defineProperty(input, "files", {
      value: [new File(["image"], "cover.png", { type: "image/png" })],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor(() =>
      document.body.textContent.includes("Uploading cover.png"),
    );
    await act(async () => render("second"));
    await act(async () =>
      pending.resolve(Response.json({ entityId: "late-image" })),
    );
    await settle();
    expect(changes).toEqual([]);
    expect(document.body.textContent).toContain("second");
    client.clear();
  });
  it("restores collection position across page navigation, editor return, and Back", async () => {
    const entity = {
      id: "post-26",
      entityType: "post",
      frontmatter: { title: "Page record" },
      body: "",
      contentHash: "hash",
      created: "2026-09-11T00:00:00Z",
      updated: "2026-09-11T00:00:00Z",
    };
    const api = new StudioApi({
      basePath: "/studio",
      fetch: async (input): Promise<Response> => {
        const url = new URL(String(input), "http://brain.test");
        requests.push(String(input));
        if (url.pathname.endsWith("/types"))
          return Response.json({
            types: [
              {
                entityType: "post",
                label: "Posts",
                isSingleton: false,
                hasBody: false,
                count: 76,
                capabilities: {
                  canRead: true,
                  canCreate: false,
                  canUpdate: true,
                  canDelete: false,
                  canAssist: false,
                  canPublish: false,
                  canExtract: false,
                },
              },
            ],
            workspaces: [],
          });
        if (url.pathname.endsWith("/schema"))
          return Response.json({
            entityType: "post",
            format: "frontmatter",
            isSingleton: false,
            hasBody: false,
            fields: [],
          });
        if (url.pathname.endsWith("/entities"))
          return Response.json(
            url.searchParams.has("id")
              ? { entity }
              : { entities: [entity], total: 76 },
          );
        return Response.json({ directorySync: false, git: null });
      },
    });
    const filters = "q=Page&visibility=public&sort=created-asc";
    const history = createMemoryHistory({
      initialEntries: [`/studio/entities/post?offset=25&${filters}`],
    });
    const router = createStudioRouter("/studio", App, history);
    const queryClient = createStudioQueryClient();
    await act(async () =>
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            StudioApiProvider,
            { api },
            createElement(RouterProvider, { router }),
          ),
        ),
      ),
    );
    await waitFor(
      () => document.querySelector("[data-studio-record]") !== null,
    );
    expect(requests).toContain(
      `/studio/api/entities?type=post&offset=25&limit=25&${filters}`,
    );
    expect(document.body.textContent).toContain("26–26 of 76");
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>("[data-studio-record]")
        ?.click(),
    );
    await waitFor(
      () => document.querySelector('[aria-label^="Back to"]') !== null,
    );
    expect(history.location.search).toBe(`?offset=25&${filters}`);
    const form = document.querySelector<HTMLFormElement>(
      "[data-studio-editor]",
    );
    if (!form) throw new Error("Editor did not open");
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(".studio-skip-content")
        ?.click(),
    );
    expect(document.activeElement).toBe(form);
    expect(form.getAttribute("role")).toBe("main");
    let submissions = 0;
    form.requestSubmit = (): void => {
      submissions += 1;
    };
    await act(async () =>
      form.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "s",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(submissions).toBe(1);
    await act(async () =>
      form.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "s",
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(submissions).toBe(2);
    await act(async () =>
      form.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "s", bubbles: true }),
      ),
    );
    expect(submissions).toBe(2);
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('[aria-label^="Back to"]')
        ?.click(),
    );
    await waitFor(
      () => document.querySelector("[data-studio-record]") !== null,
    );
    expect(history.location.search).toBe(`?offset=25&${filters}`);
    const next = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Next",
    );
    await act(async () => next?.click());
    await waitFor(() => history.location.search === `?offset=50&${filters}`);
    await act(async () => history.back());
    await waitFor(() => document.body.textContent.includes("26–26 of 76"));
    expect(history.location.search).toBe(`?offset=25&${filters}`);
    const visibility = document.querySelector<HTMLSelectElement>(
      ".studio-collection-controls select",
    );
    if (!visibility) throw new Error("Missing visibility control");
    await act(async () => {
      visibility.value = "restricted";
      visibility.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor(
      () =>
        history.location.search ===
        "?q=Page&visibility=restricted&sort=created-asc",
    );
    expect(requests).toContain(
      "/studio/api/entities?type=post&offset=0&limit=25&q=Page&visibility=restricted&sort=created-asc",
    );
    await act(async () => history.back());
    await waitFor(() => document.body.textContent.includes("26–26 of 76"));
    expect(history.location.search).toBe(`?offset=25&${filters}`);
    queryClient.clear();
  });

  it("requests navigation through the provided Studio client", async () => {
    const api = new StudioApi({ basePath: "/studio", fetch: recordingFetch });
    const router = createStudioRouter(
      "/studio",
      App,
      createMemoryHistory({ initialEntries: ["/studio"] }),
    );
    const queryClient = createStudioQueryClient();

    await act(async () => {
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            StudioApiProvider,
            { api },
            createElement(RouterProvider, { router }),
          ),
        ),
      );
    });
    // App asks for the "post" collection only because the types the provided
    // client answered with named it, so this follow-up shows the round trip.
    await waitFor(() =>
      requests.includes("/studio/api/entities?type=post&offset=0&limit=25"),
    );

    expect(requests[0]).toBe("/studio/api/types");
  });
});
