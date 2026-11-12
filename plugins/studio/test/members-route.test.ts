import type { AuthPrincipal } from "@brains/contracts";
import { describe, expect, it } from "bun:test";
import type { WebRouteDefinition } from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { createEditorRoutes } from "../src/editor-routes";
import { StudioWorkspaceRegistry } from "../src/workspace-registry";
import { studioContextOn } from "./studio-plugins";

function principal(level: "trusted" | "public"): AuthPrincipal {
  return {
    userId: `usr_${level}`,
    personId: `person_${level}`,
    displayName: `A ${level} member`,
    role: level,
    status: "active",
    permissionLevel: level,
    isAnchor: false,
  };
}

async function membersRoute(
  level: "trusted" | "public",
): Promise<WebRouteDefinition> {
  const context = await studioContextOn(createMockShell());
  const routes = createEditorRoutes({
    routePath: "/studio",
    getContext: () => context,
    resolveAuthPrincipal: async () => principal(level),
    getEntityDisplay: () => undefined,
    workspaceRegistry: new StudioWorkspaceRegistry(),
    listMembers: async () => [
      { id: "usr_alex", name: "Alex Morgan" },
      { id: "usr_sam", name: "Sam Rivera" },
    ],
  });
  const found = routes.find(
    (route) => route.path === "/studio/api/members" && route.method === "GET",
  );
  if (!found) throw new Error("Missing GET /studio/api/members");
  return found;
}

describe("the members route", () => {
  it("lists the brain's members for a trusted member, by id and name only", async () => {
    const response = await (
      await membersRoute("trusted")
    ).handler(new Request("https://brain.test/studio/api/members"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      members: [
        { id: "usr_alex", name: "Alex Morgan" },
        { id: "usr_sam", name: "Sam Rivera" },
      ],
    });
  });

  it("refuses a public caller", async () => {
    const response = await (
      await membersRoute("public")
    ).handler(new Request("https://brain.test/studio/api/members"));

    expect(response.status).toBe(403);
  });
});
