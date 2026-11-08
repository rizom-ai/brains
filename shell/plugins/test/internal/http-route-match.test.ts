import { describe, expect, it } from "bun:test";
import {
  findHandlerRoute,
  type RegisteredHttpRoute,
} from "../../src/types/http-routes";

function route(
  fullPath: string,
  match: "exact" | "prefix" = "exact",
  method: "GET" | "POST" = "GET",
): RegisteredHttpRoute {
  return {
    kind: "handler",
    ownerPluginId: "studio",
    fullPath,
    method,
    match,
    sharedHostAdmission: "admit",
    handler: async (): Promise<Response> => new Response(fullPath),
  };
}

describe("findHandlerRoute", () => {
  const routes = [
    route("/studio/entities", "prefix"),
    route("/studio/entities/post", "prefix"),
    route("/studio/entities/post/featured"),
    route("/studio/entities/post/featured", "exact", "POST"),
  ];

  it("prefers an exact path, then the longest prefix by segment", () => {
    expect(
      findHandlerRoute(routes, "GET", "/studio/entities/post/featured")
        ?.fullPath,
    ).toBe("/studio/entities/post/featured");
    expect(
      findHandlerRoute(routes, "GET", "/studio/entities/post/one")?.fullPath,
    ).toBe("/studio/entities/post");
    expect(
      findHandlerRoute(routes, "GET", "/studio/entities/note/one")?.fullPath,
    ).toBe("/studio/entities");
    expect(findHandlerRoute(routes, "GET", "/studio/entities")?.fullPath).toBe(
      "/studio/entities",
    );
  });

  it("matches neither a sibling path sharing a prefix nor another method", () => {
    expect(
      findHandlerRoute(routes, "GET", "/studio/entities-other"),
    ).toBeUndefined();
    expect(
      findHandlerRoute(routes, "POST", "/studio/entities/post/one"),
    ).toBeUndefined();
    expect(
      findHandlerRoute(routes, "POST", "/studio/entities/post/featured")
        ?.method,
    ).toBe("POST");
  });
});
