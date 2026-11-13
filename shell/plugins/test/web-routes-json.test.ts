import { describe, expect, it } from "bun:test";
import { jsonResponse } from "../src/types/web-routes";

describe("jsonResponse", () => {
  it("serializes the payload with a JSON content type", async () => {
    const response = jsonResponse({ ok: true });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(await response.json()).toEqual({ ok: true });
  });

  it("accepts a status and extra headers", async () => {
    const response = jsonResponse(
      { queued: true },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
    expect(response.status).toBe(202);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ queued: true });
  });
});
