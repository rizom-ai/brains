import { afterEach, describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { baseEntitySchema, type BaseEntity } from "@brains/entity-service";
import type {
  CreateExecutionContext,
  UploadSaveInput,
} from "@brains/entity-service";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  PermissionService,
  type EntityAdapter,
  type InterfaceCaller,
  type OperatorEntityWrites,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

const operator: InterfaceCaller = {
  actor: { id: "operator", canonicalId: "person-1" },
  permission: "admin",
  isAnchor: true,
};

const visitor: InterfaceCaller = {
  actor: { id: "visitor" },
  permission: "public",
  isAnchor: false,
};

function imageAdapter(): EntityAdapter<BaseEntity> {
  return {
    entityType: "image",
    schema: baseEntitySchema,
    purpose: "A picture somebody uploaded.",
    fromMarkdown: () => ({}),
    toMarkdown: (entity: BaseEntity) => entity.content,
    extractMetadata: () => ({}),
    parseFrontMatter: <T>(_markdown: string, schema: z.ZodSchema<T>): T =>
      schema.parse({}),
    generateFrontMatter: () => "",
    getBodyTemplate: () => "",
  };
}

/**
 * A file arrives at a console and becomes an entity of whichever type
 * declared that it takes that kind of file. The console never decides what
 * the file becomes: it stages the bytes and hands them to the type's own
 * upload handler, as the person who sent them. `createRouted`'s shape, for
 * uploads. Named consumer: @brains/studio.
 */
describe("uploading on an operator's behalf", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("operator-upload-test"),
  });

  afterEach(async () => {
    await harness.reset();
  });

  async function install(options?: {
    entityActions?: Record<string, Record<string, string>>;
  }): Promise<{
    entities: OperatorEntityWrites;
    received: Array<{
      input: UploadSaveInput;
      execution: CreateExecutionContext;
    }>;
  }> {
    if (options?.entityActions) {
      const permissions = new PermissionService({
        entityActions: options.entityActions,
      });
      harness.getMockShell().getPermissionService = (): typeof permissions =>
        permissions;
    }
    const registry = harness.getEntityRegistry();
    registry.registerEntityType("image", baseEntitySchema, imageAdapter());
    const received: Array<{
      input: UploadSaveInput;
      execution: CreateExecutionContext;
    }> = [];
    registry.registerUploadSaveHandler({
      entityType: "image",
      mediaTypes: ["image/png"],
      handler: async (input, execution) => {
        received.push({ input, execution });
        return {
          success: true,
          data: { entityId: "image-1", status: "created" },
        };
      },
    });

    let captured: OperatorEntityWrites | undefined;
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin({
        id: "studio",
        config: z.object({}),
        setup: ({ operatorEntities }) => {
          captured = operatorEntities;
          return {};
        },
      }),
      {},
      { name: "@fixture/studio", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");
    await harness.installPlugin(plugin);
    if (!captured) throw new Error("setup did not run");
    return { entities: captured, received };
  }

  const png = {
    filename: "photo.png",
    mediaType: "image/png",
    content: Buffer.from("not really a png"),
  };

  it("hands the staged file to the type that takes it, as the caller", async () => {
    const { entities, received } = await install();

    const outcome = await entities.upload(png, operator);

    expect(outcome).toMatchObject({
      kind: "created",
      entityType: "image",
      entityId: "image-1",
    });
    expect(received).toHaveLength(1);
    expect(received[0]?.input.upload).toMatchObject({ kind: "upload" });
    expect(received[0]?.execution).toMatchObject({
      interfaceType: "studio",
      actor: { kind: "user", userId: "operator", canonicalId: "person-1" },
    });
  });

  it("refuses a kind of file no type declared it takes", async () => {
    const { entities, received } = await install();

    const outcome = await entities.upload(
      { ...png, filename: "notes.txt", mediaType: "text/plain" },
      operator,
    );

    expect(outcome).toMatchObject({
      kind: "denied",
      reason: "unsupported-media-type",
    });
    expect(received).toEqual([]);
  });

  it("refuses when the caller may not create that type", async () => {
    const { entities, received } = await install({
      entityActions: { image: { create: "trusted" } },
    });

    const outcome = await entities.upload(png, visitor);

    expect(outcome).toMatchObject({
      kind: "denied",
      reason: "entity-action-policy",
    });
    expect(received).toEqual([]);
  });

  it("reports a handler that refused, without pretending it succeeded", async () => {
    const { entities } = await install();
    harness.getEntityRegistry().registerUploadSaveHandler({
      entityType: "image",
      mediaTypes: ["image/png"],
      handler: async () => ({ success: false, error: "Too blurry" }),
    });

    const outcome = await entities.upload(png, operator);

    expect(outcome).toMatchObject({ kind: "refused", message: "Too blurry" });
  });
});
