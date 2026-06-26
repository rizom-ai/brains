import { beforeEach, describe, expect, it } from "bun:test";
import type {
  BaseEntity,
  CreateInput,
  CreateInterceptionResult,
} from "@brains/entity-service";
import type { Tool, ToolContext } from "@brains/mcp-service";
import { toolResponseSchema } from "@brains/mcp-service";
import { PermissionService } from "@brains/templates";
import { z } from "@brains/utils";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";

const baseContext = (
  userPermissionLevel: ToolContext["userPermissionLevel"],
): ToolContext => ({
  interfaceType: "test",
  userId: "user-1",
  ...(userPermissionLevel && { userPermissionLevel }),
});

const makeEntity = (entityType: string, id: string): BaseEntity => ({
  id,
  entityType,
  content: `body of ${id}`,
  contentHash: `hash-${id}`,
  visibility: "public",
  metadata: { title: id },
  created: "2026-05-01T00:00:00.000Z",
  updated: "2026-05-01T00:00:00.000Z",
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

function expectSuccess<TSchema extends z.ZodTypeAny>(
  raw: unknown,
  schema: TSchema,
): z.infer<TSchema> {
  const response = toolResponseSchema.parse(raw);
  if (!("success" in response) || !response.success) {
    throw new Error(
      `Expected success response, got: ${JSON.stringify(response)}`,
    );
  }
  return schema.parse(response.data);
}

function expectConfirmation(raw: unknown): Record<string, unknown> {
  const response = toolResponseSchema.parse(raw);
  if (!("needsConfirmation" in response)) {
    throw new Error(
      `Expected confirmation response, got: ${JSON.stringify(response)}`,
    );
  }
  return z.record(z.string(), z.unknown()).parse(response.args);
}

describe("entity action policy", () => {
  let services: ReturnType<typeof createMockSystemServices>;
  let tools: Tool[];

  beforeEach(() => {
    services = createMockSystemServices({
      permissionService: new PermissionService({
        entityActions: {
          "*": { create: "trusted", update: "trusted", delete: "anchor" },
          summary: { create: "anchor", update: "anchor", delete: "anchor" },
        },
      }),
    });
    services.addEntities([makeEntity("note", "team-note")]);
    services.addEntities([makeEntity("summary", "weekly-summary")]);
    tools = createSystemTools(services);
  });

  const getTool = (name: string): Tool => {
    const tool = tools.find((candidate) => candidate.name === name);
    if (!tool) throw new Error(`${name} not found`);
    return tool;
  };

  it("allows trusted create for default team-authored entity types after confirmation", async () => {
    const confirmArgs = expectConfirmation(
      await getTool("system_create").handler(
        {
          entityType: "note",
          title: "Fresh team note",
          source: { kind: "text", content: "Team note body" },
        },
        baseContext("trusted"),
      ),
    );

    const result = await getTool("system_create").handler(
      confirmArgs,
      baseContext("trusted"),
    );
    const data = expectSuccess(
      result,
      z.object({ entityId: z.string(), status: z.string() }),
    );
    expect(data.status).toBe("created");
  });

  it("denies public create for default team-authored entity types", async () => {
    const result = await getTool("system_create").handler(
      {
        entityType: "note",
        title: "Public note",
        source: { kind: "text", content: "Body" },
      },
      baseContext("public"),
    );

    const error = expectError(result);
    expect(error).toContain("Creating `note` requires Collaborator/trusted");
    expect(error).toContain("Public/public");
  });

  it("exposes system_delete to public callers but fails closed before lookup", async () => {
    const tool = getTool("system_delete");

    expect(tool.visibility).toBe("public");

    const result = await tool.handler(
      { entityType: "note", id: "missing-note" },
      baseContext("public"),
    );

    const error = expectError(result);
    expect(error).toBe(
      "Changing content requires higher permission; current permission is Public.",
    );
  });

  it("allows trusted update for default team-authored entity types", async () => {
    expectConfirmation(
      await getTool("system_update").handler(
        {
          entityType: "note",
          id: "team-note",
          fields: { title: "Edited" },
        },
        baseContext("trusted"),
      ),
    );
  });

  it("denies trusted create for anchor-only derived entity types", async () => {
    const result = await getTool("system_create").handler(
      {
        entityType: "summary",
        title: "Weekly summary",
        source: { kind: "text", content: "Summary body" },
      },
      baseContext("trusted"),
    );

    const error = expectError(result);
    expect(error).toContain("Creating `summary` requires Owner/anchor");
    expect(error).toContain("Collaborator/trusted");
  });

  it("denies trusted update for anchor-only entity types before confirmation", async () => {
    const result = await getTool("system_update").handler(
      {
        entityType: "summary",
        id: "weekly-summary",
        fields: { title: "Edited" },
      },
      baseContext("trusted"),
    );

    const error = expectError(result);
    expect(error).toContain("Updating `summary` requires Owner/anchor");
    expect(error).toContain("Collaborator/trusted");
  });

  it("denies trusted delete for default entity types", async () => {
    const result = await getTool("system_delete").handler(
      { entityType: "note", id: "team-note" },
      baseContext("trusted"),
    );

    const error = expectError(result);
    expect(error).toContain("Deleting `note` requires Owner/anchor");
    expect(error).toContain("Collaborator/trusted");
  });

  it("allows anchor update and delete to proceed to confirmation", async () => {
    expectConfirmation(
      await getTool("system_update").handler(
        {
          entityType: "summary",
          id: "weekly-summary",
          fields: { title: "Edited" },
        },
        baseContext("anchor"),
      ),
    );

    expectConfirmation(
      await getTool("system_delete").handler(
        { entityType: "note", id: "team-note" },
        baseContext("anchor"),
      ),
    );
  });

  it("rechecks create policy after interceptors change the effective entity type", async () => {
    services.entityRegistry.registerCreateInterceptor(
      "note",
      async (input: CreateInput): Promise<CreateInterceptionResult> => ({
        kind: "continue",
        input: { ...input, entityType: "summary" },
      }),
    );

    const confirmArgs = expectConfirmation(
      await getTool("system_create").handler(
        {
          entityType: "note",
          title: "Intercepted Summary",
          source: { kind: "text", content: "Team note body" },
        },
        baseContext("trusted"),
      ),
    );

    const result = await getTool("system_create").handler(
      confirmArgs,
      baseContext("trusted"),
    );
    const error = expectError(result);
    expect(error).toContain("Creating `summary` requires Owner/anchor");
    expect(services.getEntities().has("intercepted-summary")).toBe(false);
  });
});
