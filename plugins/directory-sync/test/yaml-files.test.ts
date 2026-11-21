import {
  createMockAssetStore,
  createTestEntity,
} from "@brains/entity-service/test";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { FileOperations } from "../src/lib/file-operations";
import type { FileOperationsEntityService } from "../src/lib/file-operations";

/**
 * A YAML type's files (docs/plans/one-stored-form.md, YAML files): found
 * under its own folder, read as the stored document whose header they
 * are, and written as YAML once the store writes the next form. A YAML
 * file under a markdown type's folder is not an entity's.
 */
const STORED = "---\nsubmitLabel: Send\nvisibility: shared\n---\n";
const YAML = "submitLabel: Send\nvisibility: shared\n";

describe("a YAML type's files", () => {
  let dir: string;

  const operations = (writes: ".md" | ".yaml"): FileOperations => {
    const service: FileOperationsEntityService = {
      serializeEntity: (entity): string => entity.content,
      hasEntityType: (): boolean => true,
      openAsset: createMockAssetStore().openAsset,
      getEntityTypes: (): string[] => ["form", "note"],
      fileExtension: (type): ".md" | ".yaml" =>
        type === "form" ? writes : ".md",
      getEntityTypeConfig: (type): { storage?: "markdown" | "yaml" } =>
        type === "form" ? { storage: "yaml" } : {},
    };
    return new FileOperations(dir, service);
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "yaml-files-"));
    mkdirSync(join(dir, "form"));
    mkdirSync(join(dir, "post"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("finds a YAML type's .yaml file, and none under a markdown type", async () => {
    writeFileSync(join(dir, "form", "contact.yaml"), YAML);
    writeFileSync(join(dir, "post", "notes.yaml"), YAML);
    const files = await operations(".md").getAllSyncFiles();
    expect(files).toContain("form/contact.yaml");
    expect(files).not.toContain("post/notes.yaml");
    expect(operations(".md").isEntityFile("post/notes.yaml")).toBe(false);
  });

  it("keeps one file per record, the one in the extension the store writes", async () => {
    writeFileSync(join(dir, "form", "contact.yaml"), YAML);
    writeFileSync(join(dir, "form", "contact.md"), STORED);
    expect(await operations(".md").getAllSyncFiles()).toEqual([
      "form/contact.md",
    ]);
    expect(await operations(".yaml").getAllSyncFiles()).toEqual([
      "form/contact.yaml",
    ]);
  });

  it("reads a .yaml file as the stored document it is the header of", async () => {
    writeFileSync(join(dir, "form", "contact.yaml"), YAML);
    const raw = await operations(".md").readEntity("form/contact.yaml");
    expect(raw).toMatchObject({
      entityType: "form",
      id: "contact",
      content: STORED,
    });
  });

  it("writes .md while the store writes the current form, .yaml in the next", async () => {
    const entity = createTestEntity("form", { id: "contact", content: STORED });
    await operations(".md").writeEntity(entity);
    expect(readFileSync(join(dir, "form", "contact.md"), "utf8")).toBe(STORED);
    expect(existsSync(join(dir, "form", "contact.yaml"))).toBe(false);

    await operations(".yaml").writeEntity(entity);
    expect(readFileSync(join(dir, "form", "contact.yaml"), "utf8")).toBe(YAML);
  });

  it("deletes a record's file in either extension", () => {
    expect(operations(".md").getEntityDeletePaths("form", "contact")).toEqual([
      join(dir, "form", "contact.md"),
      join(dir, "form", "contact.yaml"),
    ]);
  });
});
