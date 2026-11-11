import { describe, expect, it } from "bun:test";
import type { ToolResponse } from "@brains/mcp-service";
import { z } from "@brains/utils/zod";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";

/** A post's editable fields; its frontmatter also keeps cardCid. */
const editable = z.object({
  title: z.string(),
  status: z.enum(["draft", "published"]),
});

/** Where a post's sections break: stated on create, never stored. */
const createOnly = z.object({ layout: z.enum(["wide", "narrow"]) });

function toolsWithPost(): ReturnType<typeof createSystemTools> {
  const services = createMockSystemServices();
  services.addEntities([
    {
      id: "on-patience",
      entityType: "post",
      content: "---\ntitle: On Patience\nstatus: draft\n---\nBody.",
      contentHash: "hash-on-patience",
      visibility: "public",
      metadata: { title: "On Patience", status: "draft" },
      created: new Date("2026-03-15T11:00:00.000Z").toISOString(),
      updated: new Date("2026-03-15T11:00:00.000Z").toISOString(),
    },
  ]);
  Object.assign(services.entityRegistry, {
    getEditableFieldsSchema: (type: string) =>
      type === "post" ? editable : undefined,
    getCreateFieldsSchema: (type: string) =>
      type === "post" ? editable.extend(createOnly.shape) : undefined,
  });
  return createSystemTools(services);
}

async function call(
  name: string,
  input: Record<string, unknown>,
): Promise<ToolResponse> {
  const tool = toolsWithPost().find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`${name} not found`);
  return tool.handler(input, {
    interfaceType: "test",
    actor: { kind: "user", userId: "test" },
    userPermissionLevel: "admin",
  });
}

const refusal = {
  success: false,
  error:
    'A post has no field "cardCid" a caller can set; its fields are title, status.',
};

describe("a field change", () => {
  it("is refused on update for a field the brain keeps", async () => {
    expect(
      await call("system_update", {
        entityType: "post",
        id: "on-patience",
        operation: { fields: { cardCid: "bafy" } },
      }),
    ).toMatchObject(refusal);
  });

  it("is proposed on update for an editable field", async () => {
    expect(
      await call("system_update", {
        entityType: "post",
        id: "on-patience",
        operation: { fields: { status: "published" } },
      }),
    ).toMatchObject({ needsConfirmation: true });
  });

  it("is refused on create for a field the brain keeps", async () => {
    expect(
      await call("system_create", {
        entityType: "post",
        title: "On Rest",
        source: { kind: "text", content: "Rest is part of the work." },
        fields: { cardCid: "bafy" },
      }),
    ).toMatchObject({
      success: false,
      error:
        'A post has no field "cardCid" a caller can set; its fields are title, status, layout.',
    });
  });

  it("is not refused on create for a field the type takes only on create", async () => {
    expect(
      await call("system_create", {
        entityType: "post",
        title: "On Rest",
        source: { kind: "text", content: "Rest is part of the work." },
        fields: { layout: "wide" },
      }),
    ).not.toMatchObject({ error: expect.stringContaining("a caller can set") });
  });

  it("is refused on update for a field the type takes only on create", async () => {
    expect(
      await call("system_update", {
        entityType: "post",
        id: "on-patience",
        operation: { fields: { layout: "wide" } },
      }),
    ).toMatchObject({
      success: false,
      error:
        'A post has no field "layout" a caller can set; its fields are title, status.',
    });
  });
});

describe("a grouping field the brain loads on demand", () => {
  // Groupings come from a definitions entity, read when first needed: until
  // then the post's fields have no clients.
  function toolsWithGroupings(): ReturnType<typeof createSystemTools> {
    const services = createMockSystemServices();
    services.addEntities([
      {
        id: "on-patience",
        entityType: "post",
        content: "---\ntitle: On Patience\nstatus: draft\n---\nBody.",
        contentHash: "hash-on-patience",
        visibility: "public",
        metadata: { title: "On Patience", status: "draft" },
        created: new Date("2026-03-15T11:00:00.000Z").toISOString(),
        updated: new Date("2026-03-15T11:00:00.000Z").toISOString(),
      },
    ]);
    let current = editable;
    const grouped = editable.extend({ clients: z.array(z.string()) });
    Object.assign(services.entityRegistry, {
      ensureGroupingsCurrent: async (): Promise<void> => {
        current = grouped;
      },
      getEditableFieldsSchema: () => current,
      getCreateFieldsSchema: () => current,
    });
    return createSystemTools(services);
  }

  it.each([
    [
      "system_update",
      {
        entityType: "post",
        id: "on-patience",
        operation: { fields: { clients: ["Beta"] } },
      },
    ],
    [
      "system_create",
      {
        entityType: "post",
        title: "On Rest",
        source: { kind: "text", content: "Rest is part of the work." },
        fields: { clients: ["Beta"] },
      },
    ],
  ])(
    "is not refused by %s before the groupings were read",
    async (name, input) => {
      const tool = toolsWithGroupings().find(
        (candidate) => candidate.name === name,
      );
      if (!tool) throw new Error(`${name} not found`);

      expect(
        await tool.handler(input, {
          interfaceType: "test",
          actor: { kind: "user", userId: "test" },
          userPermissionLevel: "admin",
        }),
      ).not.toMatchObject({
        error: expect.stringContaining("a caller can set"),
      });
    },
  );
});
