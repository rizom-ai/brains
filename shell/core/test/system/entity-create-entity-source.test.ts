import { describe, expect, test } from "bun:test";
import {
  expectConfirmationArgs,
  expectToolError,
} from "@brains/mcp-service/test";
import type { ToolContext } from "@brains/mcp-service";
import type {
  CreateInput,
  CreateInterceptionResult,
} from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import { createEntityCreateTool } from "../../src/system/entity-create-tool";
import { createMockSystemServices } from "./mock-services";

const adminContext: ToolContext = {
  interfaceType: "mcp",
  actor: { kind: "user", userId: "owner" },
  conversationId: "conversation-owned",
  userPermissionLevel: "admin",
};
const trustedContext: ToolContext = {
  ...adminContext,
  userPermissionLevel: "trusted",
};
const previewSchema = z.object({ preview: z.string() });

const noteBody =
  "# On slowness\n\nI write slowly, and I keep it that way.\n\nSecond paragraph, exactly as written.";

function fixture(): {
  services: ReturnType<typeof createMockSystemServices>;
  tool: ReturnType<typeof createEntityCreateTool>;
} {
  const services = createMockSystemServices();
  services.registerEntityTypes(["note", "post", "base"]);
  services.addEntities([
    {
      id: "on-slowness",
      entityType: "note",
      content: `---\ntitle: On slowness\n---\n\n${noteBody}\n`,
      contentHash: "hash",
      metadata: { title: "On slowness" },
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "private-thoughts",
      entityType: "note",
      content: "---\ntitle: Private thoughts\n---\n\nOnly mine.\n",
      contentHash: "hash",
      visibility: "restricted",
      metadata: { title: "Private thoughts" },
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-01T00:00:00.000Z",
    },
  ]);
  return { services, tool: createEntityCreateTool(services) };
}

function captureInterceptor(
  services: ReturnType<typeof createMockSystemServices>,
): CreateInput[] {
  const seen: CreateInput[] = [];
  services.entityRegistry.registerCreateInterceptor(
    "post",
    async (input): Promise<CreateInterceptionResult> => {
      seen.push(input);
      return {
        kind: "handled",
        result: {
          success: true,
          data: { entityId: "post-id", status: "generating" },
        },
      };
    },
  );
  return seen;
}

describe("system_create from an existing entity", () => {
  test("hands the source body verbatim, without its frontmatter, to the target type", async () => {
    const { services, tool } = fixture();
    const seen = captureInterceptor(services);

    const args = expectConfirmationArgs(
      await tool.handler(
        {
          entityType: "post",
          source: {
            kind: "entity",
            entityType: "note",
            entityId: "on-slowness",
          },
        },
        adminContext,
      ),
    );
    expect(args).toMatchObject({
      entityType: "post",
      source: { kind: "entity", entityType: "note", entityId: "on-slowness" },
    });

    expect(await tool.handler(args, adminContext)).toMatchObject({
      success: true,
      data: { entityId: "post-id" },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.content).toBe(noteBody);
    // The source's own title names the new entity unless one is given.
    expect(seen[0]?.title).toBe("On slowness");
    // The note itself is left as it was.
    expect(services.getEntities().get("on-slowness")?.entityType).toBe("note");
  });

  test("resolves the source by title as well as by id", async () => {
    const { services, tool } = fixture();
    const seen = captureInterceptor(services);
    const args = expectConfirmationArgs(
      await tool.handler(
        {
          entityType: "post",
          title: "Slowness",
          source: {
            kind: "entity",
            entityType: "note",
            entityId: "On slowness",
          },
        },
        adminContext,
      ),
    );
    expect(args).toMatchObject({
      title: "Slowness",
      source: { entityId: "on-slowness" },
    });
    await tool.handler(args, adminContext);
    expect(seen[0]?.title).toBe("Slowness");
  });

  test("a source the caller cannot read is not found", async () => {
    const { tool } = fixture();
    const result = await tool.handler(
      {
        entityType: "post",
        source: {
          kind: "entity",
          entityType: "note",
          entityId: "private-thoughts",
        },
      },
      trustedContext,
    );
    expect(expectToolError(result).error).toContain("not found");
  });

  test("keeps a non-public source's visibility unless another is requested", async () => {
    const { services, tool } = fixture();
    const seen = captureInterceptor(services);
    const args = expectConfirmationArgs(
      await tool.handler(
        {
          entityType: "post",
          source: {
            kind: "entity",
            entityType: "note",
            entityId: "private-thoughts",
          },
        },
        adminContext,
      ),
    );
    expect(args).toMatchObject({ visibility: "restricted" });
    await tool.handler(args, adminContext);
    expect(seen[0]?.visibility).toBe("restricted");
  });
});

describe("system_create fields", () => {
  const published = {
    status: "published",
    publishedAt: "2025-03-12",
    canonicalUrl: "https://example.substack.com/p/on-slowness",
  };

  test("carries stated fields through confirmation to the type's interceptor", async () => {
    const { services, tool } = fixture();
    const seen = captureInterceptor(services);
    const pending = await tool.handler(
      {
        entityType: "post",
        title: "On slowness",
        source: { kind: "text", content: "I write slowly." },
        fields: published,
      },
      adminContext,
    );
    const { preview } = previewSchema.parse(pending);
    expect(preview).toContain("publishedAt: 2025-03-12");
    expect(preview).toContain(
      "canonicalUrl: https://example.substack.com/p/on-slowness",
    );
    const args = expectConfirmationArgs(pending);
    expect(args).toMatchObject({ fields: published });

    await tool.handler(args, adminContext);
    expect(seen[0]?.fields).toEqual(published);
  });

  test("merges fields into the frontmatter of a direct create", async () => {
    const { services, tool } = fixture();
    services.addEntities([
      {
        id: "existing-base",
        entityType: "base",
        content: "---\ntitle: Existing\n---\n\nBody",
        contentHash: "hash",
        metadata: { title: "Existing" },
        created: "2026-01-01T00:00:00.000Z",
        updated: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const args = expectConfirmationArgs(
      await tool.handler(
        {
          entityType: "base",
          title: "Kept",
          source: {
            kind: "text",
            content: "---\ntitle: Kept\n---\n\nExact body",
          },
          fields: { status: "done" },
        },
        adminContext,
      ),
    );
    await tool.handler(args, adminContext);
    expect(services.getLastMarkdownCreate()?.markdown).toBe(
      "---\ntitle: Kept\nstatus: done\n---\n\nExact body\n",
    );
  });

  test("refuses visibility as a field; it has its own typed input", async () => {
    const { tool } = fixture();
    const result = await tool.handler(
      {
        entityType: "post",
        source: { kind: "text", content: "Text" },
        fields: { visibility: "restricted" },
      },
      adminContext,
    );
    expect(expectToolError(result).error).toContain("visibility");
  });
});
