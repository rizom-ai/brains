import { describe, expect, it, mock } from "bun:test";
import { ApiError, StudioApi, studioApiPath } from "./api";
import { z } from "@brains/utils/zod";

describe("grouping usage transport", () => {
  it("preserves exact values and cancellation under a custom mount", async () => {
    const values = [
      " Acme ",
      "a,b",
      "Client\u0000name",
      "\ufeffClient",
      "%+&",
      "",
    ];
    const expected = {
      entries: 2,
      values: values.map((value): { value: string; count: number } => ({
        value,
        count: 1,
      })),
    };
    const controller = new AbortController();
    const api = new StudioApi({
      basePath: "/operator/content/",
      fetch: async (input, init): Promise<Response> => {
        const url = new URL(String(input), "https://studio.test");
        expect(url.pathname).toBe("/operator/content/api/groups/usage");
        expect(url.searchParams.get("grouping")).toBe("clients");
        expect(url.searchParams.getAll("value")).toEqual(values);
        expect(init?.signal).toBe(controller.signal);
        return Response.json(expected);
      },
    });
    expect(
      await api.fetchGroupingUsage("clients", values, controller.signal),
    ).toEqual(expected);
  });
  it("refuses an oversized batch or a cancelled request before transport", async () => {
    const fetch = mock(async (): Promise<Response> =>
      Response.json({ entries: 0, values: [] }),
    );
    const api = new StudioApi({ basePath: "/studio", fetch });
    const controller = new AbortController();
    const oversized = await api
      .fetchGroupingUsage(
        "clients",
        Array.from({ length: 101 }, (): string => "Acme"),
        controller.signal,
      )
      .catch((error: unknown): unknown => error);
    expect(oversized).toBeInstanceOf(z.ZodError);
    controller.abort(new Error("Usage cancelled"));
    const cancelled = await api
      .fetchGroupingUsage("clients", [], controller.signal)
      .catch((error: unknown): unknown => error);
    expect(cancelled).toBe(controller.signal.reason);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("retains the readiness error and retry delay rather than inventing zero usage", async () => {
    const api = new StudioApi({
      basePath: "/studio",
      fetch: async (): Promise<Response> =>
        Response.json(
          {
            code: "groupings_initializing",
            error: "Collections are initializing",
          },
          { status: 503, headers: { "Retry-After": "1" } },
        ),
    });
    const error = await api
      .fetchGroupingUsage("clients", [], new AbortController().signal)
      .catch((cause: unknown): unknown => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 503,
      code: "groupings_initializing",
      retryAfterMs: 1000,
    });
  });
});

describe("studioApiPath", () => {
  it("derives API requests from the configured Studio route", () => {
    expect(studioApiPath("workspace?id=publishing", "/studio")).toBe(
      "/studio/api/workspace?id=publishing",
    );
    expect(studioApiPath("entities?type=post", "/operator/content/")).toBe(
      "/operator/content/api/entities?type=post",
    );
  });

  it("retains the default Studio route", () => {
    expect(studioApiPath("types", "/studio")).toBe("/studio/api/types");
  });
});
