import { describe, expect, it } from "bun:test";
import { errorMessage, requireSameOriginJson } from "../src/http-responses";

describe("auth HTTP mutation guards", () => {
  it("accepts same-origin JSON requests", () => {
    const request = new Request(
      "https://brain.example.com/auth/admin/mutations",
      {
        method: "POST",
        headers: {
          origin: "https://brain.example.com",
          "content-type": "application/json; charset=utf-8",
        },
      },
    );

    expect(requireSameOriginJson(request)).toBeUndefined();
  });

  it("returns private errors for cross-origin and non-JSON requests", async () => {
    const crossOrigin = requireSameOriginJson(
      new Request("https://brain.example.com/auth/admin/mutations", {
        method: "POST",
        headers: {
          origin: "https://other.example.com",
          "content-type": "application/json",
        },
      }),
    );
    expect(crossOrigin?.status).toBe(403);
    expect(crossOrigin?.headers.get("cache-control")).toBe("no-store");
    expect(await crossOrigin?.json()).toEqual({
      error: "Same-origin request required",
    });

    const nonJson = requireSameOriginJson(
      new Request("https://brain.example.com/auth/admin/mutations", {
        method: "POST",
        headers: {
          origin: "https://brain.example.com",
          "content-type": "text/plain",
        },
      }),
    );
    expect(nonJson?.status).toBe(415);
    expect(await nonJson?.json()).toEqual({ error: "JSON request required" });
  });
});

describe("errorMessage", () => {
  it("uses Error messages without exposing unknown thrown values", () => {
    expect(errorMessage(new Error("Known failure"), "Fallback")).toBe(
      "Known failure",
    );
    expect(errorMessage({ secret: "value" }, "Fallback")).toBe("Fallback");
  });
});
