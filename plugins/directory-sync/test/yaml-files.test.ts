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
  utimesSync,
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
      deserializeEntity: (): Record<string, never> => ({}),
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

/**
 * A record moving from its .md to its .yaml file (docs/plans/one-stored-form.md,
 * From .md to .yaml): an .md that reads as the record is the old copy and
 * goes once the .yaml is written; an edited one is kept and, being newer,
 * is the file read.
 */
describe("a YAML type's record moving from .md to .yaml", () => {
  let dir: string;
  const OLD = "---\nsubmitLabel: Send\nvisibility: shared\n---\n\n";

  const operations = (): FileOperations =>
    new FileOperations(dir, {
      serializeEntity: (entity): string => entity.content,
      deserializeEntity: (markdown): { content: string } => ({
        // The old form reads as the record: header-only, no blank body line.
        content: markdown.replace(/\n---\n\n$/u, "\n---\n"),
      }),
      hasEntityType: (): boolean => true,
      openAsset: createMockAssetStore().openAsset,
      getEntityTypes: (): string[] => ["form"],
      fileExtension: (): ".md" | ".yaml" => ".yaml",
      getEntityTypeConfig: (): { storage?: "markdown" | "yaml" } => ({
        storage: "yaml",
      }),
    });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "yaml-migration-"));
    mkdirSync(join(dir, "form"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("removes an .md that reads as the record once its .yaml is written", async () => {
    writeFileSync(join(dir, "form", "contact.md"), OLD);
    const entity = createTestEntity("form", { id: "contact", content: STORED });
    await operations().writeEntity(entity);
    expect(readFileSync(join(dir, "form", "contact.yaml"), "utf8")).toBe(YAML);
    expect(existsSync(join(dir, "form", "contact.md"))).toBe(false);
  });

  it("keeps an .md that reads as something else", async () => {
    writeFileSync(
      join(dir, "form", "contact.md"),
      "---\nsubmitLabel: Go\nvisibility: shared\n---\n",
    );
    const entity = createTestEntity("form", { id: "contact", content: STORED });
    await operations().writeEntity(entity);
    expect(existsSync(join(dir, "form", "contact.md"))).toBe(true);
  });

  it("reads the newer of a record's two files", async () => {
    writeFileSync(join(dir, "form", "contact.yaml"), YAML);
    writeFileSync(join(dir, "form", "contact.md"), OLD);
    utimesSync(
      join(dir, "form", "contact.yaml"),
      new Date(1000),
      new Date(1000),
    );
    utimesSync(join(dir, "form", "contact.md"), new Date(2000), new Date(2000));
    expect(await operations().getAllSyncFiles()).toEqual(["form/contact.md"]);
    utimesSync(join(dir, "form", "contact.md"), new Date(500), new Date(500));
    expect(await operations().getAllSyncFiles()).toEqual(["form/contact.yaml"]);
  });
});
