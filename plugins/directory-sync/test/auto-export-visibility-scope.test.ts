import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DirectorySyncPlugin } from "../src/plugin";
import { createPluginHarness } from "@brains/plugins/test";
import type { BaseEntity } from "@brains/plugins/test";
import { baseEntitySchema } from "@brains/plugins/test";
import { createTestEntity, waitUntil } from "@brains/test-utils";
import { MockEntityAdapter } from "./fixtures";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync, rmSync, readFileSync, mkdtempSync } from "fs";

/**
 * Regression: a non-public entity that is *updated* must still be exported.
 *
 * The `entity:updated` subscriber re-reads the entity from the DB rather than
 * trusting the event payload (see `entity-updated-subscriber.test.ts`). That
 * read goes through `entityService.getEntity`, which fails closed: an absent
 * `visibilityScope` filters to public-only
 * (`shell/entity-service/src/entity-queries.ts` — "Fail closed: undefined
 * visibilityScope filters to public-only"). Every `shared` or `restricted`
 * entity therefore came back `null`, the subscriber logged "Entity not found
 * in DB, skipping export" and returned, the file was never rewritten, and the
 * debounced git auto-commit found a clean tree with nothing to commit.
 *
 * The symptom in production: edits made through the site never reached the
 * content repo, while newly created entities did — `entity:created` writes the
 * payload directly and never performs the scoped read. Every `Auto-sync` commit
 * was an `added`, never a `modified`.
 *
 * Export is a system-internal mirror of the whole DB — `export-pipeline.ts`
 * already lists across all tiers via `internalFullScope(...)` — so the
 * single-entity read must opt up the same way.
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
  entityService.getEntity = async <T extends BaseEntity>(request: {
    entityType: string;
    id: string;
    visibilityScope?: BaseEntity["visibility"];
  }): Promise<T | null> =>
    inner<T>({
      ...request,
      visibilityScope: request.visibilityScope ?? "public",
    });
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
