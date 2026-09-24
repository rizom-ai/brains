/** @jsxImportSource react */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { QueryClientProvider } from "@tanstack/react-query";
import { Window } from "happy-dom";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StudioApi } from "./api";
import { StudioApiProvider } from "./studio-api-context";
import { createStudioQueryClient } from "./query-client";
import { useGroupingSuggestions } from "./use-grouping-suggestions";

import type { StudioGrouping } from "../../src/grouping-vocabulary-contract";

const groupings = [
  { key: "clients", label: "Clients", field: "clients", types: ["note"] },
];
let windowInstance: Window;
let restoreGlobals: RestoreGlobals;
let root: Root;
let client: ReturnType<typeof createStudioQueryClient>;
let suggestions: Record<string, readonly string[]>;

beforeEach(() => {
  windowInstance = new Window({ url: "https://studio.test/studio" });
  restoreGlobals = installDomGlobals(windowInstance);
  client = createStudioQueryClient();
  suggestions = {};
  root = createRoot(document.body.appendChild(document.createElement("div")));
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restoreGlobals();
});
function Probe({
  declarations,
}: {
  declarations: readonly StudioGrouping[];
}): ReactElement {
  suggestions = useGroupingSuggestions(declarations);
  return <pre>{JSON.stringify(suggestions)}</pre>;
}
async function render(
  api: StudioApi,
  declarations: readonly StudioGrouping[] = groupings,
): Promise<void> {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <StudioApiProvider api={api}>
          <Probe declarations={declarations} />
        </StudioApiProvider>
      </QueryClientProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

test.each([401, 403])(
  "hides cached suggestions after %s and recovers with fresh scoped values",
  async (status) => {
    let phase: "private" | "denied" | "public" = "private";
    const api = new StudioApi({
      basePath: "/studio",
      fetch: async (): Promise<Response> =>
        phase === "denied"
          ? Response.json({ error: "Access ended" }, { status })
          : Response.json({
              values: [
                {
                  value:
                    phase === "private" ? "Private client" : "Public client",
                  count: 1,
                },
              ],
              total: 1,
            }),
    });
    await render(api);
    await settle();
    expect(suggestions).toEqual({ clients: ["Private client"] });
    phase = "denied";
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["studio", "groupings"] });
    });
    await settle();
    expect(client.getQueryCache().getAll()[0]?.state.status).toBe("error");
    expect(suggestions).toEqual({});
    phase = "public";
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["studio", "groupings"] });
    });
    await settle();
    expect(suggestions).toEqual({ clients: ["Public client"] });
  },
);

test("closed groupings neither fetch nor retain open catalog suggestions", async () => {
  let requests = 0;
  const api = new StudioApi({
    basePath: "/studio",
    fetch: async (): Promise<Response> => {
      requests++;
      return Response.json({
        values: [{ value: "Stray", count: 1 }],
        total: 1,
      });
    },
  });
  await render(api);
  await settle();
  expect(suggestions).toEqual({ clients: ["Stray"] });
  const before = requests;
  await render(
    api,
    groupings.map((grouping) => ({
      ...grouping,
      vocabulary: { multiple: true, values: ["Acme"] },
    })),
  );
  await settle();
  expect(requests).toBe(before);
  expect(suggestions).toEqual({});
});

test("does not reuse another API session's cached suggestions", async () => {
  const api = (value: string): StudioApi =>
    new StudioApi({
      basePath: "/studio",
      fetch: async (): Promise<Response> =>
        Response.json({ values: [{ value, count: 1 }], total: 1 }),
    });
  await render(api("Private client"));
  await settle();
  expect(suggestions).toEqual({ clients: ["Private client"] });
  await render(api("Public client"));
  await settle();
  expect(suggestions).toEqual({ clients: ["Public client"] });
});
