import { beforeEach, describe, expect, it } from "bun:test";
import type { Tool, ToolContext } from "@brains/mcp-service";
import { toolResponseSchema } from "@brains/mcp-service";
import type { BaseEntity, ContentVisibility } from "@brains/entity-service";
import { z } from "@brains/utils/zod-v4";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";

const createDataSchema = z.object({
  status: z.string(),
  entityId: z.string().optional(),
  jobId: z.string().optional(),
});

function expectError(raw: unknown): string {
  const response = toolResponseSchema.parse(raw);
  if (!("success" in response) || response.success) {
    throw new Error(
      `Expected error response, got: ${JSON.stringify(response)}`,
    );
  }
  return response.error;
}

interface Parser<T> {
  parse(input: unknown): T;
}

function expectSuccess<T>(raw: unknown, schema: Parser<T>): T {
  const response = toolResponseSchema.parse(raw);
  if (!("success" in response) || !response.success) {
    throw new Error(
      `Expected success response, got: ${JSON.stringify(response)}`,
    );
  }
  return schema.parse(response.data);
}

const confirmationArgsSchema = z.record(z.string(), z.unknown());

function expectConfirmation(raw: unknown): { args: Record<string, unknown> } {
  const response = toolResponseSchema.parse(raw);
  if (!("needsConfirmation" in response)) {
    throw new Error(
      `Expected confirmation response, got: ${JSON.stringify(response)}`,
    );
  }
  return { args: confirmationArgsSchema.parse(response.args) };
}

const makeEntity = (id: string, visibility: ContentVisibility): BaseEntity => ({
  id,
  entityType: "doc",
  content: `body of ${id}`,
  contentHash: `hash-${id}`,
  visibility,
  metadata: { title: id },
  created: "2026-05-01T00:00:00.000Z",
  updated: "2026-05-01T00:00:00.000Z",
});

const baseContext = (
  userPermissionLevel?: ToolContext["userPermissionLevel"],
): ToolContext => ({
  interfaceType: "test",
  userId: "test",
  ...(userPermissionLevel && { userPermissionLevel }),
});

describe("write tools cap visibility by caller permission", () => {
  let tools: Tool[];
  let services: ReturnType<typeof createMockSystemServices>;

  beforeEach(() => {
    services = createMockSystemServices();
    services.addEntities([
      makeEntity("doc-public", "public"),
      makeEntity("doc-shared", "shared"),
      makeEntity("doc-restricted", "restricted"),
    ]);
    tools = createSystemTools(services);
  });

  const getTool = (name: string): Tool => {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(`${name} not found`);
    return tool;
  };

  async function runCreate(
    input: Record<string, unknown>,
    level: ToolContext["userPermissionLevel"],
  ): Promise<unknown> {
    const { content, ...rest } = input;
    const createInput =
      typeof content === "string"
        ? { ...rest, source: { kind: "text", content } }
        : input;
    const result = await getTool("system_create").handler(
      createInput,
      baseContext(level),
    );
    const response = toolResponseSchema.parse(result);
    if (!("needsConfirmation" in response)) {
      return result;
    }
    return getTool("system_create").handler(response.args, baseContext(level));
  }

  async function runUpdate(
    input: Record<string, unknown>,
    level: ToolContext["userPermissionLevel"],
  ): Promise<unknown> {
    return getTool("system_update").handler(input, baseContext(level));
  }

  describe("system_create", () => {
    it("rejects a trusted user creating an entity with visibility: restricted", async () => {
      const result = await runCreate(
        {
          entityType: "doc",
          title: "Restricted note",
          content:
            "---\ntitle: Restricted note\nvisibility: restricted\n---\nBody",
        },
        "trusted",
      );
      const error = expectError(result);
      expect(error).toMatch(/visibility/i);
      expect(error).toMatch(/restricted/);
      expect(error).toMatch(/trusted/);
    });

    it("rejects a public user creating an entity with visibility: shared", async () => {
      const result = await runCreate(
        {
          entityType: "doc",
          title: "Shared note",
          content: "---\ntitle: Shared note\nvisibility: shared\n---\nBody",
        },
        "public",
      );
      const error = expectError(result);
      expect(error).toMatch(/visibility/i);
      expect(error).toMatch(/shared/);
    });

    it("allows a trusted user creating an entity with visibility: shared", async () => {
      const result = await runCreate(
        {
          entityType: "doc",
          title: "Shared note",
          content: "---\ntitle: Shared note\nvisibility: shared\n---\nBody",
        },
        "trusted",
      );
      const data = expectSuccess(result, createDataSchema);
      expect(data.status).toBe("created");
    });

    it("allows an anchor user creating an entity with visibility: restricted", async () => {
      const result = await runCreate(
        {
          entityType: "doc",
          title: "Restricted note",
          content:
            "---\ntitle: Restricted note\nvisibility: restricted\n---\nBody",
        },
        "anchor",
      );
      const data = expectSuccess(result, createDataSchema);
      expect(data.status).toBe("created");
    });

    it("allows a public user creating an entity with default (public) visibility", async () => {
      const result = await runCreate(
        {
          entityType: "doc",
          title: "Public note",
          content: "---\ntitle: Public note\n---\nBody",
        },
        "public",
      );
      const data = expectSuccess(result, createDataSchema);
      expect(data.status).toBe("created");
    });
  });

  describe("system_update via fields", () => {
    it("rejects a trusted user upgrading visibility to restricted", async () => {
      const confirm = expectConfirmation(
        await runUpdate(
          {
            entityType: "doc",
            id: "doc-shared",
            fields: { visibility: "restricted" },
          },
          "trusted",
        ),
      );
      const result = await runUpdate(confirm.args, "trusted");
      const error = expectError(result);
      expect(error).toMatch(/visibility/i);
      expect(error).toMatch(/restricted/);
    });

    it("rejects a public user upgrading visibility to shared", async () => {
      const confirm = expectConfirmation(
        await runUpdate(
          {
            entityType: "doc",
            id: "doc-public",
            fields: { visibility: "shared" },
          },
          "public",
        ),
      );
      const result = await runUpdate(confirm.args, "public");
      const error = expectError(result);
      expect(error).toMatch(/visibility/i);
      expect(error).toMatch(/shared/);
    });

    it("allows a trusted user setting visibility to shared", async () => {
      const confirm = expectConfirmation(
        await runUpdate(
          {
            entityType: "doc",
            id: "doc-shared",
            fields: { visibility: "shared", title: "Shared updated" },
          },
          "trusted",
        ),
      );
      const result = await runUpdate(confirm.args, "trusted");
      const data = expectSuccess(result, z.object({ updated: z.string() }));
      expect(data.updated).toBe("doc-shared");
    });

    it("allows an anchor user setting visibility to restricted", async () => {
      const confirm = expectConfirmation(
        await runUpdate(
          {
            entityType: "doc",
            id: "doc-shared",
            fields: { visibility: "restricted" },
          },
          "anchor",
        ),
      );
      const result = await runUpdate(confirm.args, "anchor");
      const data = expectSuccess(result, z.object({ updated: z.string() }));
      expect(data.updated).toBe("doc-shared");
    });

    it("allows updating non-visibility fields without touching visibility", async () => {
      const confirm = expectConfirmation(
        await runUpdate(
          {
            entityType: "doc",
            id: "doc-public",
            fields: { title: "renamed" },
          },
          "public",
        ),
      );
      const result = await runUpdate(confirm.args, "public");
      const data = expectSuccess(result, z.object({ updated: z.string() }));
      expect(data.updated).toBe("doc-public");
    });
  });

  describe("system_update via content replacement", () => {
    it("rejects a trusted user replacing content with frontmatter visibility: restricted", async () => {
      const confirm = expectConfirmation(
        await runUpdate(
          {
            entityType: "doc",
            id: "doc-shared",
            content:
              "---\ntitle: Promoted\nvisibility: restricted\n---\nNew body",
          },
          "trusted",
        ),
      );
      const result = await runUpdate(confirm.args, "trusted");
      const error = expectError(result);
      expect(error).toMatch(/visibility/i);
      expect(error).toMatch(/restricted/);
    });

    it("allows replacing content that keeps the visibility within the caller's writable scope", async () => {
      const confirm = expectConfirmation(
        await runUpdate(
          {
            entityType: "doc",
            id: "doc-shared",
            content: "---\ntitle: Demoted\nvisibility: public\n---\nNew body",
          },
          "trusted",
        ),
      );
      const result = await runUpdate(confirm.args, "trusted");
      const data = expectSuccess(result, z.object({ updated: z.string() }));
      expect(data.updated).toBe("doc-shared");
    });
  });
});
