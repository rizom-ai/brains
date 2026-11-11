import { afterEach, describe, expect, test } from "bun:test";
import styleGuidePackage from "@brains/style-guide";
import { createServicePluginContext } from "@brains/plugins";
import {
  createEditorRoutes,
  StudioWorkspaceRegistry,
} from "@brains/studio/test";
import { z } from "@brains/utils/zod";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * A declared singleton that is missing, such as a style guide an operator
 * deleted, created again through Studio: its editor sends no id, and the
 * record is created under the type's id, as a class adapter created it.
 */

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

describe("Studio creating a missing declared singleton", () => {
  test("creates it under its type's id", async () => {
    const opened = await declaredEntityStore(
      styleGuidePackage,
      "@brains/style-guide",
      "style-guide",
    );
    stores.push(opened);
    const context = createServicePluginContext(opened.shell, "studio");
    const create = createEditorRoutes({
      routePath: "/studio",
      getContext: () => context,
      getEntityDisplay: () => undefined,
      workspaceRegistry: new StudioWorkspaceRegistry(),
      resolveAuthPrincipal: async () => ({
        userId: "admin",
        personId: "admin",
        displayName: "Admin",
        role: "admin",
        permissionLevel: "admin",
        status: "active",
        isAnchor: true,
      }),
    }).find(
      (route) =>
        route.method === "POST" && route.path === "/studio/api/entities",
    );
    if (!create) throw new Error("No create route");

    const response = await create.handler(
      new Request("https://studio.test/studio/api/entities", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://studio.test",
        },
        body: JSON.stringify({
          entityType: "style-guide",
          frontmatter: { name: "House style" },
          body: "Write plainly.",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(
      z.object({ entityId: z.string() }).parse(await response.json()).entityId,
    ).toBe("style-guide");
    const created = await opened.service.getEntity({
      entityType: "style-guide",
      id: "style-guide",
      visibilityScope: "restricted",
    });
    expect(created?.metadata).toMatchObject({ name: "House style" });
  });
});
