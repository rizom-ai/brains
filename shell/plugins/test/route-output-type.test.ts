import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { defineRoute } from "../src/public/interface-definition";
import { verbatim } from "../src/interface/route-contract";

/**
 * What a route handler is allowed to answer with.
 *
 * The runtime parses the handler's return value with the declared response
 * schema, so the static type of that return is the schema's input. This file
 * is a compile fixture: the `@ts-expect-error` lines fail typecheck if the
 * handler return type ever widens back to `unknown`, and the running
 * assertions below prove the same routes still answer.
 */
describe("what a route handler may return", () => {
  const countSchema = z.object({ count: z.number() });

  it("accepts the shape the response schema declares", async () => {
    const route = defineRoute({
      method: "GET",
      path: "/count",
      security: { kind: "public" },
      response: countSchema,
      handle: () => ({ count: 1 }),
    });

    expect(
      await route.handle({
        request: new Request("http://test/count"),
        body: undefined,
        caller: null,
      }),
    ).toEqual({ count: 1 });
  });

  it("refuses a field the schema does not declare", () => {
    const route = defineRoute({
      method: "GET",
      path: "/count",
      security: { kind: "public" },
      response: countSchema,
      // @ts-expect-error a string is not the declared number
      handle: () => ({ count: "wrong" }),
    });

    expect(route.path).toBe("/count");
  });

  it("refuses a payload missing a declared field", () => {
    const route = defineRoute({
      method: "GET",
      path: "/count",
      security: { kind: "public" },
      response: countSchema,
      // @ts-expect-error count is required
      handle: () => ({}),
    });

    expect(route.path).toBe("/count");
  });

  it("takes the input side of a schema that transforms", async () => {
    const route = defineRoute({
      method: "GET",
      path: "/when",
      security: { kind: "public" },
      response: z.object({
        at: z.string().transform((value) => new Date(value)),
      }),
      handle: () => ({ at: "2026-09-07T00:00:00.000Z" }),
    });

    expect(
      await route.handle({
        request: new Request("http://test/when"),
        body: undefined,
        caller: null,
      }),
    ).toEqual({ at: "2026-09-07T00:00:00.000Z" });
  });

  it("takes a Response from a route hosting its own protocol", async () => {
    const route = defineRoute({
      method: "GET",
      path: "/stream",
      security: { kind: "public" },
      response: verbatim,
      handle: () => new Response("event: ping\n\n", { status: 200 }),
    });

    const answer = await route.handle({
      request: new Request("http://test/stream"),
      body: undefined,
      caller: null,
    });
    expect(answer.status).toBe(200);
  });

  it("refuses data from a route that declared a verbatim response", () => {
    const route = defineRoute({
      method: "GET",
      path: "/stream",
      security: { kind: "public" },
      response: verbatim,
      // @ts-expect-error a verbatim route answers with a Response
      handle: () => ({ count: 1 }),
    });

    expect(route.path).toBe("/stream");
  });
});
