import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DirectorySyncPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import type {
  BaseEntity,
  EntitySchema,
  GetEntityRequest,
} from "@brains/plugins";
import { baseEntitySchema } from "@brains/plugins/test";
import { createTestEntity, waitUntil } from "@brains/test-utils";
import { MockEntityAdapter } from "./fixtures";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync, rmSync, readFileSync, mkdtempSync } from "fs";

/**
 * Regression: durable export re-reads current entity state. That internal
 * persistence read must span all visibility tiers rather than fail closed to
 * public-only content.
 */

type HarnessEntityService = ReturnType<
  ReturnType<
    typeof createPluginHarness<DirectorySyncPlugin>
  >["getEntityService"]
>;

/**
 * The shared mock returns the entity when no `visibilityScope` is passed,
 * while production treats an absent scope as public-only. That divergence is
 * exactly what hid this bug, so restore the production rule here.
 */
function failClosedOnVisibility(entityService: HarnessEntityService): void {
  const inner = entityService.getEntity.bind(entityService);
  function scopedGetEntity(
    request: GetEntityRequest,
  ): Promise<BaseEntity | null>;
  function scopedGetEntity<T extends BaseEntity>(
    request: GetEntityRequest,
    schema: EntitySchema<T>,
  ): Promise<T | null>;
  function scopedGetEntity(
    request: GetEntityRequest,
    schema?: EntitySchema<BaseEntity>,
  ): Promise<BaseEntity | null> {
    const scoped = {
      ...request,
      visibilityScope: request.visibilityScope ?? "public",
    };
    return schema ? inner(scoped, schema) : inner(scoped);
  }
  entityService.getEntity = scopedGetEntity;
}

describe("auto-export visibility scope", () => {
  let harness: ReturnType<typeof createPluginHarness<DirectorySyncPlugin>>;
  let syncPath: string;

  beforeEach(async () => {
    syncPath = mkdtempSync(join(tmpdir(), "test-auto-export-visibility-"));

    harness = createPluginHarness<DirectorySyncPlugin>({ dataDir: syncPath });
    harness
      .getEntityRegistry()
      .registerEntityType("note", baseEntitySchema, new MockEntityAdapter());
    failClosedOnVisibility(harness.getEntityService());

    await harness.installPlugin(
      new DirectorySyncPlugin({
        syncPath,
        autoSync: true,
        initialSync: false,
        commitDebounce: 100,
      }),
    );
  });

  afterEach(() => {
    harness.reset();
    if (existsSync(syncPath)) {
      rmSync(syncPath, { recursive: true, force: true });
    }
  });

  for (const visibility of ["public", "shared", "restricted"] as const) {
    it(`exports an updated ${visibility} entity`, async () => {
      const id = `note-${visibility}`;
      const entity: BaseEntity = createTestEntity("note", {
        id,
        content: "# Edited on the site\n\nThe new body.",
        visibility,
      });

      await harness.getEntityService().upsertEntity({ entity });

      await harness.sendMessage("entity:updated", {
        entity,
        entityType: "note",
        entityId: id,
      });

      const filePath = join(syncPath, `${id}.md`);
      await waitUntil(
        () => existsSync(filePath),
        `the subscriber to export the updated ${visibility} entity`,
      );

      expect(readFileSync(filePath, "utf-8")).toContain("The new body.");
    });
  }

  it("exports a later edit to a restricted entity over the created file", async () => {
    const id = "note-restricted-edit";
    const created: BaseEntity = createTestEntity("note", {
      id,
      content: "# Draft\n\nFirst version.",
      visibility: "restricted",
    });

    await harness.getEntityService().upsertEntity({ entity: created });
    await harness.sendMessage("entity:created", {
      entity: created,
      entityType: "note",
      entityId: id,
    });

    const filePath = join(syncPath, `${id}.md`);
    await waitUntil(
      () => existsSync(filePath),
      "the subscriber to export the created restricted entity",
    );

    const edited: BaseEntity = {
      ...created,
      content: "# Draft\n\nSecond version.",
    };
    await harness.getEntityService().upsertEntity({ entity: edited });
    await harness.sendMessage("entity:updated", {
      entity: edited,
      entityType: "note",
      entityId: id,
    });

    await waitUntil(
      () => readFileSync(filePath, "utf-8").includes("Second version."),
      "the exported file to carry the edit rather than the created version",
    );
  });
});
