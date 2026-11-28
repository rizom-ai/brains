import { describe, expect, test } from "bun:test";
import {
  BaseEntityAdapter,
  baseEntitySchema,
  type BaseEntity,
} from "@brains/plugins";
import { createMockShell } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import { createEditorRoutes } from "../src/editor-routes";
import { StudioWorkspaceRegistry } from "../src/workspace-registry";
import { studioContextOn } from "./studio-plugins";

// A new post is a draft, and what it needs to publish waits until then: the
// form starts it as a draft and asks only for what writing needs.
const postSchema = z.object({
  title: z.string(),
  status: z.enum(["draft", "queued", "published"]),
  excerpt: z.string(),
  author: z.string(),
});
class PostAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor() {
    super({
      entityType: "post",
      purpose: "Draft schema fixture",
      schema: baseEntitySchema,
      frontmatterSchema: postSchema,
    });
  }
  fromMarkdown(content: string): Partial<BaseEntity> {
    return { content };
  }
}

describe("a publishable type's form", () => {
  test("starts a draft and leaves what publishing needs for later", async () => {
    const shell = createMockShell();
    shell
      .getEntityRegistry()
      .registerEntityType("post", baseEntitySchema, new PostAdapter(), {
        publish: {
          publishStatuses: ["queued", "published"],
          requiredFields: ["excerpt", "author"],
        },
      });
    const context = await studioContextOn(shell);
    const routes = createEditorRoutes({
      routePath: "/studio",
      getContext: () => context,
      getEntityDisplay: () => undefined,
      workspaceRegistry: new StudioWorkspaceRegistry(),
      resolveAuthPrincipal: async () => ({
        userId: "user",
        personId: "person",
        displayName: "Writer",
        role: "trusted",
        status: "active",
        permissionLevel: "trusted",
        isAnchor: false,
      }),
    });
    const route = routes.find(
      (candidate) =>
        candidate.path === "/studio/api/schema" && candidate.method === "GET",
    );
    if (!route) throw new Error("No schema route");
    const response = await route.handler(
      new Request("https://example.com/studio/api/schema?type=post"),
    );
    const body = z
      .object({
        fields: z.array(
          z.looseObject({
            name: z.string(),
            required: z.boolean().optional(),
            default: z.unknown().optional(),
          }),
        ),
      })
      .parse(await response.json());
    const field = (name: string): unknown =>
      body.fields.find((candidate) => candidate.name === name);
    expect(field("status")).toMatchObject({ default: "draft" });
    expect(field("excerpt")).toMatchObject({ required: false, default: "" });
    expect(field("author")).toMatchObject({ required: false, default: "" });
    expect(field("title")).not.toHaveProperty("required");
  });
});
