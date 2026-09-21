/** @jsxImportSource react */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { App } from "./App";
import { StudioApi } from "./api";
import { StudioApiProvider } from "./studio-api-context";
import { createStudioRouter } from "./studio-router";
import { createStudioQueryClient } from "./query-client";
import { groupingQueryOptions } from "./grouping-queries";
import { groupingQuery } from "./grouping-url-query";
import { StudioGroupingView } from "./studio-groupings";

let windowInstance: Window;
let restoreGlobals: RestoreGlobals;
beforeEach(() => {
  windowInstance = new Window({ url: "https://studio.test/studio" });
  restoreGlobals = installDomGlobals(windowInstance, {
    localStorage: windowInstance.localStorage,
    NodeFilter: windowInstance.NodeFilter,
    Event: windowInstance.Event,
    CustomEvent: windowInstance.CustomEvent,
    MutationObserver: windowInstance.MutationObserver,
    ResizeObserver: windowInstance.ResizeObserver,
    requestAnimationFrame:
      windowInstance.requestAnimationFrame.bind(windowInstance),
    cancelAnimationFrame:
      windowInstance.cancelAnimationFrame.bind(windowInstance),
    getComputedStyle: windowInstance.getComputedStyle.bind(windowInstance),
  });
});
let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restoreGlobals();
});
async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error(`Grouping view never settled: ${document.body.textContent}`);
}
for (const status of [401, 403])
  test.each(["", "?value=Acme"])(
    `same-API access denial (${status}) hides cached rows/counts and Retry uses fresh access (%s)`,
    async (search) => {
      const client = createStudioQueryClient();
      const query = groupingQuery(search);
      const grouping = {
        key: "clients",
        label: "Clients",
        field: "clients",
        types: ["post"],
      };
      let phase: "admin" | "denied" | "trusted" = "admin";
      let requests = 0;
      const api = new StudioApi({
        basePath: "/studio",
        fetch: async (): Promise<Response> => {
          requests++;
          if (phase === "denied")
            return Response.json(
              { error: "Your Studio access has ended." },
              { status },
            );
          return Response.json(
            search
              ? {
                  entities:
                    phase === "admin"
                      ? [
                          {
                            entityType: "post",
                            id: "secret",
                            displayTitle: "Private result",
                            frontmatter: {},
                            updated: "2026-09-17T00:00:00Z",
                          },
                        ]
                      : [],
                  total: phase === "admin" ? 1 : 0,
                }
              : {
                  values:
                    phase === "admin"
                      ? [{ value: "Private result", count: 1 }]
                      : [],
                  total: phase === "admin" ? 1 : 0,
                },
          );
        },
      });
      root = createRoot(
        document.body.appendChild(document.createElement("div")),
      );
      try {
        await act(async () =>
          root?.render(
            <QueryClientProvider client={client}>
              <StudioApiProvider api={api}>
                <StudioGroupingView
                  basePath="/studio"
                  grouping={grouping}
                  types={[]}
                  query={query}
                  onChange={() => {}}
                  onOpen={() => {}}
                />
              </StudioApiProvider>
            </QueryClientProvider>,
          ),
        );
        await waitFor(() =>
          document.body.textContent.includes("Private result"),
        );
        phase = "denied";
        await act(async () => {
          await client.invalidateQueries({
            queryKey: groupingQueryOptions(api, "clients", query).queryKey,
          });
        });
        await waitFor(() =>
          document.body.textContent.includes("Your Studio access has ended."),
        );
        expect(document.body.textContent).not.toContain("Private result");
        expect(document.body.textContent).not.toContain(
          search ? "1 entity" : "1 collection",
        );
        expect(requests).toBe(2);
        phase = "trusted";
        const retry = [...document.querySelectorAll("button")].find(
          (button) => button.textContent === "Retry",
        );
        if (!retry) throw new Error("Missing access-error Retry action");
        await act(async () => retry.click());
        await waitFor(() =>
          document.body.textContent.includes(
            search ? "No entries in this group" : "No clients here yet",
          ),
        );
        expect(document.body.textContent).not.toContain("Private result");
        expect(requests).toBe(3);
      } finally {
        client.clear();
      }
    },
  );
test.each(["", "?value=Acme"])(
  "session-scoped views discard previous rows and cancel replaced requests (%s)",
  async (search) => {
    const client = createStudioQueryClient();
    const query = groupingQuery(search);
    const grouping = {
      key: "clients",
      label: "Clients",
      field: "clients",
      types: ["post"],
    };
    const admin = new StudioApi({
      basePath: "/studio",
      fetch: async (): Promise<Response> =>
        Response.json(
          search
            ? {
                entities: [
                  {
                    entityType: "post",
                    id: "secret",
                    displayTitle: "Private result",
                    frontmatter: {},
                    updated: "2026-09-17T00:00:00Z",
                  },
                ],
                total: 1,
              }
            : { values: [{ value: "Private result", count: 1 }], total: 1 },
        ),
    });
    let aborted = false;
    const pending = new StudioApi({
      basePath: "/studio",
      fetch: (_input, init): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new DOMException("Session ended", "AbortError"));
            },
            { once: true },
          );
        }),
    });
    const trusted = new StudioApi({
      basePath: "/studio",
      fetch: async (): Promise<Response> =>
        Response.json(
          search ? { entities: [], total: 0 } : { values: [], total: 0 },
        ),
    });
    const element = document.createElement("div");
    document.body.append(element);
    root = createRoot(element);
    const render = async (api: StudioApi): Promise<void> => {
      await act(async () =>
        root?.render(
          <QueryClientProvider client={client}>
            <StudioApiProvider api={api}>
              <StudioGroupingView
                basePath="/studio"
                grouping={grouping}
                query={query}
                types={[]}
                onOpen={() => {}}
                onChange={() => {}}
              />
            </StudioApiProvider>
          </QueryClientProvider>,
        ),
      );
    };
    await render(admin);
    await waitFor(() => document.body.textContent.includes("Private result"));
    await render(pending);
    expect(document.body.textContent).not.toContain("Private result");
    expect(
      client.getQueryData(
        groupingQueryOptions(pending, "clients", query).queryKey,
      ),
    ).toBeUndefined();
    await render(trusted);
    await waitFor(
      () =>
        aborted &&
        document.body.textContent.includes(
          search ? "No entries in this group" : "No clients here yet",
        ),
    );
    expect(document.body.textContent).not.toContain("Private result");
    expect(
      client.getQueryData(
        groupingQueryOptions(trusted, "clients", query).queryKey,
      ),
    ).toMatchObject({ total: 0 });
    await act(async () => client.clear());
  },
);

test.each([
  ["read", null],
  ["save", null],
  ["delete", null],
  ["save", false],
  ["save", true],
] as const)(
  "a direct member link initializes, opens its ordinary editor, and returns with refreshed membership (%s, multiple=%s)",
  async (action, multiple) => {
    const writable = action !== "read";
    const path =
      "/studio/groups/clients?value=Acme&type=post&sort=created-asc&limit=10";
    const history = createMemoryHistory({ initialEntries: [path] });
    const router = createStudioRouter("/studio", App, history);
    let ready = false;
    let member = true;
    const requests: string[] = [];
    const id = "\ufeffold\u0000:post";
    const api = new StudioApi({
      basePath: "/studio",
      fetch: async (input, init): Promise<Response> => {
        const url = new URL(String(input), "https://studio.test");
        requests.push(url.pathname);
        if (url.pathname.endsWith("/types"))
          return Response.json({
            types: [
              {
                entityType: "post",
                label: "Posts",
                isSingleton: false,
                count: 1,
                hasBody: false,
                capabilities: {
                  canRead: true,
                  canCreate: false,
                  canUpdate: writable,
                  canDelete: action === "delete",
                  canExtract: false,
                  canPublish: false,
                  canAssist: false,
                },
              },
            ],
            workspaces: [],
            groupings: [
              {
                key: "clients",
                label: "Clients",
                field: "clients",
                types: ["post"],
                ...(multiple !== null && {
                  vocabulary: { multiple, values: ["Acme", "Beta"] },
                }),
              },
            ],
          });
        if (url.pathname.endsWith("/groups/members"))
          return ready
            ? Response.json({
                entities: member
                  ? [
                      {
                        id,
                        entityType: "post",
                        frontmatter: { title: "Rollout" },
                        updated: "2026-09-17T00:00:00Z",
                      },
                    ]
                  : [],
                total: member ? 1 : 0,
              })
            : Response.json(
                { code: "groupings_initializing", error: "Initializing" },
                { status: 503, headers: { "Retry-After": "0.01" } },
              );
        if (url.pathname.endsWith("/schema"))
          return Response.json({
            entityType: "post",
            format: "frontmatter",
            isSingleton: false,
            hasBody: false,
            fields: [
              { name: "title", label: "Title", widget: "string" },
              {
                name: "clients",
                label: "Clients",
                widget: "list",
                field: { name: "clients", label: "Clients", widget: "string" },
                required: false,
              },
            ],
          });
        if (url.pathname.endsWith("/entities") && init?.method === "DELETE") {
          expect(url.searchParams.get("id")).toBe(id);
          expect(JSON.parse(String(init.body))).toEqual({ confirmed: true });
          member = false;
          return Response.json({ deleted: true });
        }
        if (url.pathname.endsWith("/entities") && init?.method === "PUT") {
          expect(JSON.parse(String(init.body))).toMatchObject({
            id,
            frontmatter: { clients: [] },
          });
          member = false;
          return Response.json({ entityId: id, skipped: false });
        }
        if (url.pathname.endsWith("/entities"))
          return Response.json({
            entity: {
              id,
              entityType: "post",
              frontmatter: {
                title: "Rollout",
                visibility: "public",
                clients: member ? ["Acme"] : [],
              },
              body: "",
              contentHash: member ? "hash" : "saved-hash",
              updated: "2026-09-17T00:00:00Z",
            },
          });
        if (url.pathname.endsWith("/hierarchy"))
          return Response.json({
            prefix: null,
            folders: [],
            entities: [],
            total: 0,
          });
        if (url.pathname.endsWith("/sync-status"))
          return Response.json({ git: null, directorySync: null });
        return Response.json({}, { status: 404 });
      },
    });
    const client = createStudioQueryClient();
    const catalogKey = groupingQueryOptions(
      api,
      "clients",
      groupingQuery(""),
    ).queryKey;
    client.setQueryData(catalogKey, {
      kind: "catalog",
      values: [{ value: "Acme", count: 1 }],
      total: 1,
    });
    const element = document.createElement("div");
    document.body.append(element);
    root = createRoot(element);
    await act(async () => {
      root?.render(
        <QueryClientProvider client={client}>
          <StudioApiProvider api={api}>
            <RouterProvider router={router} />
          </StudioApiProvider>
        </QueryClientProvider>,
      );
    });
    await waitFor(
      () => document.body.textContent.includes("Preparing groups") === true,
    );
    expect(document.querySelectorAll("[data-studio-record]")).toHaveLength(0);
    expect(requests.some((request) => request.endsWith("/hierarchy"))).toBe(
      false,
    );
    ready = true;
    await waitFor(
      () => document.querySelectorAll("[data-studio-record]").length === 1,
    );
    const record = document.querySelector<HTMLButtonElement>(
      "[data-studio-record]",
    );
    await act(async () => record?.click());
    await waitFor(
      () => document.body.textContent.includes("Back to Acme") === true,
    );
    expect(history.location.pathname).toBe(
      `/studio/entities/post/${encodeURIComponent(id)}`,
    );
    if (action === "delete") {
      const menu = document.querySelector<HTMLButtonElement>(
        '[aria-label="More document actions"]',
      );
      expect(menu).not.toBeNull();
      await act(async () =>
        menu?.dispatchEvent(
          new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        ),
      );
      await waitFor(() => document.querySelector('[role="menuitem"]') !== null);
      await act(async () =>
        document.querySelector<HTMLElement>('[role="menuitem"]')?.click(),
      );
      await waitFor(() =>
        document.body.textContent.includes("Delete this entry?"),
      );
      const confirm = [...document.querySelectorAll("button")].find(
        (button) => button.textContent === "Delete entry",
      );
      expect(confirm).toBeDefined();
      await act(async () => confirm?.click());
      await waitFor(() => !member && history.location.href === path);
    } else if (action === "save") {
      if (multiple === null)
        expect(
          document.querySelector('[aria-label="Add clients value"]'),
        ).not.toBeNull();
      else if (multiple)
        expect(
          document.querySelectorAll(
            '[data-studio-field="grouping-choice"] input[type="checkbox"]',
          ),
        ).toHaveLength(2);
      else
        expect(
          document.querySelector(
            '[data-studio-field="grouping-choice"] select',
          ),
        ).not.toBeNull();
      const remove = document.querySelector<HTMLButtonElement>(
        '[aria-label="Remove Acme"]',
      );
      expect(remove).not.toBeNull();
      await act(async () => remove?.click());
      const save = [...document.querySelectorAll("button")].find((button) =>
        button.textContent.includes("Save changes"),
      );
      expect(save?.disabled).toBe(false);
      await act(async () => save?.click());
      await waitFor(
        () =>
          !member &&
          document.querySelector('[aria-label="Remove Acme"]') === null &&
          document.body.textContent.includes("Saved"),
      );
    } else expect(document.body.textContent).not.toContain("Save changes");
    if (writable)
      expect(client.getQueryState(catalogKey)?.isInvalidated).toBe(true);
    if (action !== "delete") {
      const back = [...document.querySelectorAll("button")].find((button) =>
        button.textContent.includes("Back to Acme"),
      );
      await act(async () => back?.click());
    }
    await waitFor(() => history.location.href === path);
    await waitFor(() =>
      writable
        ? document.body.textContent.includes("No entries in this group")
        : document.querySelectorAll("[data-studio-record]").length === 1,
    );
    await act(async () => client.clear());
  },
);
