import { describe, expect, it } from "bun:test";
import { expectDefined } from "@brains/utils/expect-defined";
import type { BaseEntity, EntityTypeConfig } from "@brains/entity-service";
import type { ToolContext, Tool } from "@brains/mcp-service";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";

const context: ToolContext = {
  interfaceType: "mcp",
  actor: { kind: "user", userId: "test" },
  userPermissionLevel: "admin",
};

function entity(entityType: string): BaseEntity {
  return {
    id: `${entityType}-1`,
    entityType,
    content: "data:application/pdf;base64,PRIVATE_BYTES",
    contentHash: "hash",
    visibility: "public",
    metadata: { title: "Binary fixture" },
    created: "2020-01-01T00:00:00.000Z",
    updated: "2020-01-01T00:00:00.000Z",
  };
}

function setup(
  entityType: string,
  binaryStorage?: "data-url" | "asset",
): {
  services: ReturnType<typeof createMockSystemServices>;
  exec: (
    name: string,
    input: Record<string, unknown>,
  ) => ReturnType<Tool["handler"]>;
} {
  const services = createMockSystemServices();
  services.addEntities([entity(entityType)]);
  services.entityRegistry.getEntityTypeConfig = (): EntityTypeConfig =>
    binaryStorage ? { binaryStorage } : {};
  const tools = createSystemTools(services);
  return {
    services,
    exec: (
      name: string,
      input: Record<string, unknown>,
    ): ReturnType<Tool["handler"]> =>
      expectDefined(
        tools.find((t) => t.name === `system_${name}`),
        name,
      ).handler(input, context),
  };
}

describe("declared binary entity types", () => {
  for (const type of ["image", "document", "test-binary"]) {
    it(`${type}: get and search never expose the binary body`, async () => {
      const { exec } = setup(type, "data-url");
      const get = await exec("get", { entityType: type, id: `${type}-1` });
      const search = await exec("search", {
        query: "Binary",
        scope: { kind: "all" },
      });
      expect(get).toMatchObject({
        success: true,
        data: { entity: { content: expect.stringContaining("[binary") } },
      });
      expect(search).toMatchObject({
        success: true,
        data: {
          results: [
            { entity: { content: expect.stringContaining("[binary") } },
          ],
        },
      });
      expect(JSON.stringify([get, search])).not.toContain("PRIVATE_BYTES");
    });

    it(`${type}: excluded from stale insights`, async () => {
      const { exec } = setup(type, "data-url");
      expect(await exec("insights", { type: "content-health" })).toMatchObject({
        success: true,
        data: { stale: [] },
      });
    });

    it.each(["prompt", "prompt-from-source"])(
      `${type}: refuses %s generation`,
      async (kind) => {
        const { exec } = setup(type, "data-url");
        const result = await exec("generate", {
          operation: {
            kind,
            entityType: type,
            prompt: "Create a fixture",
            ...(kind === "prompt-from-source"
              ? { source: { entityType: type, entityId: `${type}-1` } }
              : {}),
          },
        });
        expect(result).toMatchObject({
          success: false,
          code: "unsupported-generation",
          error: expect.stringContaining("attachment"),
        });
      },
    );
  }

  it("also sanitizes asset-backed binary content", async () => {
    const { exec } = setup("asset-binary", "asset");
    expect(
      await exec("get", { entityType: "asset-binary", id: "asset-binary-1" }),
    ).toMatchObject({
      success: true,
      data: { entity: { content: expect.stringContaining("[binary") } },
    });
  });

  it("does not sanitize or exclude an undeclared text type", async () => {
    const { exec } = setup("text-type");
    expect(
      await exec("get", { entityType: "text-type", id: "text-type-1" }),
    ).toMatchObject({
      success: true,
      data: { entity: { content: entity("text-type").content } },
    });
    expect(await exec("insights", { type: "content-health" })).toMatchObject({
      success: true,
      data: { stale: [{ id: "text-type-1" }] },
    });
  });
});
