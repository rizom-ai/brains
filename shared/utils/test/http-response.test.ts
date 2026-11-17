import { describe, expect, it } from "bun:test";
import { withHeaders } from "../src/http-response";

describe("withHeaders", () => {
  it("answers the same response with the headers set over its own", async () => {
    const response = new Response("body", {
      status: 201,
      statusText: "Created",
      headers: { "Content-Type": "text/plain", "X-Kept": "yes" },
    });

    const answered = withHeaders(response, {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    });

    expect(answered.status).toBe(201);
    expect(answered.statusText).toBe("Created");
    expect(answered.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(answered.headers.get("Content-Type")).toBe("application/json");
    expect(answered.headers.get("X-Kept")).toBe("yes");
    expect(await answered.text()).toBe("body");
  });
});
