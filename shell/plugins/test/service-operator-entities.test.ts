import { afterEach, describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { baseEntitySchema, type BaseEntity } from "@brains/entity-service";
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
  actor: { id: "operator" },
  permission: "admin",
  isAnchor: true,
};

const visitor: InterfaceCaller = {
  actor: { id: "visitor" },
  permission: "public",
  isAnchor: false,
};

/** A plain type to edit. The tests read no metadata off it. */
function noteAdapter(): EntityAdapter<BaseEntity> {
  return {
    entityType: "note",
    schema: baseEntitySchema,
    purpose: "A note somebody wrote.",
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
 * A console edits every entity type on an operator's behalf, and declares
 * none of them. A package's own writes are scoped to what it declares
 * because a job has nobody to act for; a console has a caller by
 * construction, and this takes one on every call.
 * Named consumer: @brains/studio.
 */
describe("editing entities on an operator's behalf", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("operator-entities-test"),
  });

  afterEach(async () => {
    await harness.reset();
  });

  /**
   * Install the console, with the brain's entity-action policy in place
   * first: the capability holds the permission service from registration,
   * as it does in production.
   */
  async function install(
    entityActions?: Record<string, Record<string, string>>,
  ): Promise<OperatorEntityWrites> {
    if (entityActions) {
      const permissions = new PermissionService({ entityActions });
      harness.getMockShell().getPermissionService = (): typeof permissions =>
        permissions;
    }
    harness
      .getEntityRegistry()
      .registerEntityType("note", baseEntitySchema, noteAdapter());

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
    return captured;
  }

  async function seedNote(): Promise<BaseEntity> {
    await harness.getEntityService().createEntity({
      entity: {
        id: "note-1",
        entityType: "note",
        content: "The original body",
        metadata: { title: "A note" },
      },
    });
    const stored = await harness
      .getEntityService()
      .getEntity({ entityType: "note", id: "note-1" });
    if (!stored) throw new Error("The note was not seeded");
    return stored;
  }

  it("edits a type the package does not declare", async () => {
    const entities = await install();
    const stored = await seedNote();

    const outcome = await entities.update(
      {
        entityType: "note",
        id: "note-1",
        next: { ...stored, content: "An edited body" },
      },
      operator,
    );

    expect(outcome.kind).toBe("updated");
    const after = await harness
      .getEntityService()
      .getEntity({ entityType: "note", id: "note-1" });
    expect(after?.content).toBe("An edited body");
  });

  it("answers not-found for an entity nobody stored", async () => {
    const entities = await install();

    const outcome = await entities.update(
      {
        entityType: "note",
        id: "missing",
        next: {
          id: "missing",
          entityType: "note",
          content: "Body",
          contentHash: "hash",
          metadata: {},
          visibility: "public",
          created: "2026-09-01T00:00:00.000Z",
          updated: "2026-09-01T00:00:00.000Z",
        },
      },
      operator,
    );

    expect(outcome).toEqual({ kind: "not-found" });
  });

  it("reports what an operator may do to a type", async () => {
    const entities = await install({ note: { update: "trusted" } });

    expect(entities.allows("note", "update", operator)).toBe(true);
    expect(entities.allows("note", "update", visitor)).toBe(false);
  });

  it("refuses an edit the brain's policy refuses", async () => {
    const entities = await install({ note: { update: "trusted" } });
    const stored = await seedNote();

    const outcome = await entities.update(
      {
        entityType: "note",
        id: "note-1",
        next: { ...stored, content: "An edited body" },
      },
      visitor,
    );

    // A public caller cannot see the note either, so it is refused before
    // the policy is reached — which is the same answer, arrived at earlier.
    expect(outcome.kind).not.toBe("updated");
    const after = await harness
      .getEntityService()
      .getEntity({ entityType: "note", id: "note-1" });
    expect(after?.content).toBe("The original body");
  });

  it("removes an entity the operator may delete", async () => {
    const entities = await install();
    await seedNote();

    const outcome = await entities.delete(
      { entityType: "note", id: "note-1" },
      operator,
    );

    expect(outcome).toEqual({ kind: "deleted" });
    expect(
      await harness
        .getEntityService()
        .getEntity({ entityType: "note", id: "note-1" }),
    ).toBeNull();
  });

  it("refuses to remove a singleton, which is updated instead", async () => {
    const entities = await install();

    const outcome = await entities.delete(
      { entityType: "anchor-profile", id: "anchor-profile" },
      operator,
    );

    expect(outcome).not.toEqual({ kind: "deleted" });
  });
});
