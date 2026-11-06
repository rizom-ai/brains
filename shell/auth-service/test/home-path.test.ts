import { expect, test } from "bun:test";
import type { WebRouteRole } from "@brains/contracts";
import type { RegisteredWebRoute } from "@brains/plugins";
import { homePathFor } from "../src/auth-service-plugin";

const route = (
  fullPath: string,
  role?: WebRouteRole,
): Pick<RegisteredWebRoute, "fullPath" | "definition"> => ({
  fullPath,
  definition: {
    path: fullPath,
    handler: (): Response => new Response(null),
    ...(role ? { role } : {}),
  },
});

test("a new operator lands in Studio when the brain has one, else at the site", () => {
  expect(homePathFor([route("/studio", "studio")])).toBe("/studio");
  expect(homePathFor([route("/dashboard", "dashboard")])).toBe("/");
});
