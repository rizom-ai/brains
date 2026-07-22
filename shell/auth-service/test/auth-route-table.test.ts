import { describe, expect, it } from "bun:test";
import { AuthRouteTable } from "../src/route-table";

describe("AuthRouteTable", () => {
  it("dispatches exact method/path routes without method fallthrough", async () => {
    const routes = new AuthRouteTable<{ issuer: string }>([
      {
        method: "POST",
        path: "/token",
        handler: (_request, context): Promise<Response> =>
          Promise.resolve(new Response(context.issuer)),
      },
    ]);

    const matched = await routes.dispatch(
      new Request("https://brain.example.com/token", { method: "POST" }),
      { issuer: "https://brain.example.com" },
    );
    const wrongMethod = await routes.dispatch(
      new Request("https://brain.example.com/token"),
      { issuer: "https://brain.example.com" },
    );

    expect(await matched?.text()).toBe("https://brain.example.com");
    expect(wrongMethod).toBeUndefined();
  });
});
