import { expect, test } from "bun:test";
import { StudioApi, ApiError } from "./api";
import { groupingUsageQueryOptions } from "./grouping-queries";
import { createStudioQueryClient } from "./query-client";

test("usage batches exact values without adding the repeated distinct entry total", async () => {
  const requests: string[][] = [];
  const values = [
    " Acme ",
    "Client\u0000name",
    ...Array.from({ length: 203 }, (_, i): string => String(i)),
  ];
  const api = new StudioApi({
    basePath: "/studio",
    fetch: async (input): Promise<Response> => {
      const batch = new URL(
        String(input),
        "https://studio.test",
      ).searchParams.getAll("value");
      requests.push(batch);
      return Response.json({
        entries: 2,
        values: batch.map((value): { value: string; count: number } => ({
          value,
          count: 1,
        })),
      });
    },
  });
  const client = createStudioQueryClient();
  try {
    const result = await client.fetchQuery(
      groupingUsageQueryOptions(api, "clients", values),
    );
    expect(requests.map((batch) => batch.length)).toEqual([100, 100, 5]);
    expect(result.entries).toBe(2);
    expect(result.values.map((entry) => entry.value)).toEqual(values);
  } finally {
    client.clear();
  }
});

test("a later batch failure never publishes partial or zero usage", async () => {
  let calls = 0;
  const api = new StudioApi({
    basePath: "/studio",
    fetch: async (): Promise<Response> => {
      calls++;
      return calls === 1
        ? Response.json({ entries: 7, values: [] })
        : Response.json({ error: "Access ended" }, { status: 403 });
    },
  });
  const client = createStudioQueryClient();
  const options = groupingUsageQueryOptions(
    api,
    "clients",
    Array.from({ length: 101 }, (_, i): string => String(i)),
  );
  try {
    const error = await client
      .fetchQuery(options)
      .catch((cause: unknown): unknown => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect(calls).toBe(2);
    expect(client.getQueryData(options.queryKey)).toBeUndefined();
    const other = new StudioApi({ basePath: "/studio" });
    expect(
      groupingUsageQueryOptions(other, "clients", []).queryKey,
    ).not.toEqual(groupingUsageQueryOptions(api, "clients", []).queryKey);
  } finally {
    client.clear();
  }
});

test("initializing retries restart the bounded read without duplicating earlier counts", async () => {
  let calls = 0;
  const values = Array.from({ length: 101 }, (_, i): string => String(i));
  const api = new StudioApi({
    basePath: "/studio",
    fetch: async (input): Promise<Response> => {
      if (++calls === 2)
        return Response.json(
          { code: "groupings_initializing" },
          { status: 503, headers: { "Retry-After": "0.01" } },
        );
      const batch = new URL(
        String(input),
        "https://studio.test",
      ).searchParams.getAll("value");
      return Response.json({
        entries: 2,
        values: batch.map((value): { value: string; count: number } => ({
          value,
          count: 1,
        })),
      });
    },
  });
  const client = createStudioQueryClient();
  try {
    const result = await client.fetchQuery(
      groupingUsageQueryOptions(api, "clients", values),
    );
    expect(calls).toBe(4);
    expect(result.entries).toBe(2);
    expect(result.values.map((entry) => entry.value)).toEqual(values);
  } finally {
    client.clear();
  }
});
