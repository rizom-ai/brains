import { expect, test } from "bun:test";
import { QueryObserver } from "@tanstack/react-query";
import { StudioApi, ApiError, type GroupingPage } from "./api";
import { createStudioQueryClient } from "./query-client";
import {
  groupingQueryOptions,
  isGroupingsInitializing,
} from "./grouping-queries";
import { groupingQuery } from "./grouping-url-query";

function response(ready: boolean): Response {
  return Response.json(
    ready
      ? { values: [{ value: "Acme", count: 2 }], total: 1 }
      : { code: "groupings_initializing", error: "Initializing" },
    { status: ready ? 200 : 503, headers: { "Retry-After": "0.01" } },
  );
}
test("an open grouping query retries initialization and never caches an empty success", async () => {
  const client = createStudioQueryClient();
  let calls = 0;
  const api = new StudioApi({
    basePath: "/studio",
    fetch: async (): Promise<Response> => response(++calls > 1),
  });
  const options = groupingQueryOptions(api, "clients", groupingQuery(""));
  const observer = new QueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});
  try {
    const result = await client.fetchQuery(options);
    expect(result).toEqual({
      kind: "catalog",
      values: [{ value: "Acme", count: 2 }],
      total: 1,
    });
    expect(calls).toBe(2);
    expect(client.getQueryData<GroupingPage>(options.queryKey)).toEqual(result);
    expect(client.getDefaultOptions().queries?.retry).toBe(false);
  } finally {
    unsubscribe();
    client.clear();
  }
});
test("initialization has a finite wait budget and explicit retry starts a fresh budget", async () => {
  const client = createStudioQueryClient();
  let ready = false;
  const api = new StudioApi({
    basePath: "/studio",
    fetch: async (): Promise<Response> => response(ready),
  });
  const options = groupingQueryOptions(api, "clients", groupingQuery(""), 20);
  const error = await client
    .fetchQuery(options)
    .catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(Error);
  expect(isGroupingsInitializing(error)).toBe(false);
  expect(client.getQueryData(options.queryKey)).toBeUndefined();
  ready = true;
  expect((await client.fetchQuery(options)).total).toBe(1);
  client.clear();
});
test("unrelated errors never retry and different client sessions never share grouping data", async () => {
  const client = createStudioQueryClient();
  let calls = 0;
  const api = new StudioApi({
    basePath: "/studio",
    fetch: async (): Promise<Response> => {
      calls++;
      return Response.json(
        { error: "Unavailable", code: "other" },
        { status: 503 },
      );
    },
  });
  const options = groupingQueryOptions(api, "clients", groupingQuery(""));
  expect(
    await client.fetchQuery(options).catch((cause: unknown) => cause),
  ).toBeInstanceOf(ApiError);
  expect(calls).toBe(1);
  const other = new StudioApi({
    basePath: "/studio",
    fetch: async (): Promise<Response> => response(true),
  });
  expect(
    groupingQueryOptions(other, "clients", groupingQuery("")).queryKey,
  ).not.toEqual(options.queryKey);
  client.clear();
});
test("cancellation aborts transport and stops initialization retries", async () => {
  const client = createStudioQueryClient();
  let calls = 0;
  const api = new StudioApi({
    basePath: "/studio",
    fetch: async (_input, init): Promise<Response> => {
      calls++;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      });
    },
  });
  const options = groupingQueryOptions(
    api,
    "clients",
    groupingQuery("?value=Acme"),
  );
  const pending = client.fetchQuery(options).catch((cause: unknown) => cause);
  await client.cancelQueries({ queryKey: options.queryKey });
  await pending;
  expect(calls).toBe(1);
  expect(client.getQueryData(options.queryKey)).toBeUndefined();
  client.clear();
});
