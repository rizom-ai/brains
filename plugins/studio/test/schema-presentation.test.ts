import { describe, expect, it } from "bun:test";
import type { AuthPrincipal } from "@brains/auth-service";
import {
  BaseEntityAdapter,
  baseEntitySchema,
  type BaseEntity,
} from "@brains/plugins";
import {
  createMockShell,
  createServicePluginContext,
} from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import { entityDisplayTitle } from "../src/editor-entities";
import { createEditorRoutes } from "../src/editor-routes";
import { StudioWorkspaceRegistry } from "../src/workspace-registry";

const frontmatterSchema = z.object({
  title: z.string().optional(),
  checksum: z.string().optional().meta({ studioWidget: "hidden" }),
});

/** A type whose title is its body heading, as action items are. */
class HeadingAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor() {
    super({
      entityType: "card",
      purpose: "Studio presentation fixtures",
      schema: baseEntitySchema,
      frontmatterSchema,
    });
  }

  public fromMarkdown(markdown: string): Partial<BaseEntity> {
    return { entityType: "card", content: markdown, metadata: {} };
  }

  public displayTitle(entity: BaseEntity): string | undefined {
    return entity.content.match(/^#\s+(.+)$/m)?.[1];
  }
}

const trusted: AuthPrincipal = {
  userId: "usr_trusted",
  personId: "person_trusted",
  displayName: "A trusted member",
  role: "trusted",
  status: "active",
  permissionLevel: "trusted",
  isAnchor: false,
};

function studio(): {
  context: ReturnType<typeof createServicePluginContext>;
  schemaRoute: ReturnType<typeof createEditorRoutes>[number];
} {
  const shell = createMockShell();
  const registry = shell.getEntityRegistry();
  registry.registerEntityType("card", baseEntitySchema, new HeadingAdapter());
  registry.getEffectiveFrontmatterSchema = (
    entityType,
  ): typeof frontmatterSchema | undefined =>
    entityType === "card" ? frontmatterSchema : undefined;
  const context = createServicePluginContext(shell, "studio");
  const routes = createEditorRoutes({
    routePath: "/studio",
    getContext: () => context,
    resolveAuthPrincipal: async () => trusted,
    getEntityDisplay: () => undefined,
    workspaceRegistry: new StudioWorkspaceRegistry(),
  });
  const schemaRoute = routes.find(
    (route) => route.path === "/studio/api/schema" && route.method === "GET",
  );
  if (!schemaRoute) throw new Error("Missing GET /studio/api/schema");
  return { context, schemaRoute };
}

describe("how Studio presents an entity", () => {
  it("leaves out fields the schema hides", async () => {
    const { schemaRoute } = studio();
    const response = await schemaRoute.handler(
      new Request("https://brain.test/studio/api/schema?type=card"),
    );
    const body = z
      .object({ fields: z.array(z.object({ name: z.string() })) })
      .parse(await response.json());

    expect(body.fields.map((field) => field.name)).toContain("title");
    expect(body.fields.map((field) => field.name)).not.toContain("checksum");
  });

  it("names an entity by its adapter's display title", () => {
    const { context } = studio();
    expect(
      entityDisplayTitle(context, {
        id: "order-name-badges-k3f9a2",
        entityType: "card",
        content: "# Rent tables\n\nFor the spring gathering.\n",
        contentHash: "hash",
        metadata: {},
        visibility: "shared",
        created: "2026-10-21T00:00:00.000Z",
        updated: "2026-10-21T00:00:00.000Z",
      }),
    ).toBe("Rent tables");
  });
});
