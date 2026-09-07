import { describe, expect, test } from "bun:test";
import { createTestEntity } from "@brains/entity-service/test";
import { encodeEntityIdPath } from "@brains/entity-service";
import { entityIdPathSchema } from "@brains/plugins";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildEntityFilePath,
  parseEntityPath,
  resolveEntityPlacement,
} from "../src/lib/entity-paths";
import { FileOperations } from "../src/lib/file-operations";
import { EntityPlacementError } from "../src/lib/entity-placement-error";

describe("injective entity placement", () => {
  test.each(["note", "section", "site-content", "image", "document"])(
    "%s valid IDs have distinct paths and round-trip unchanged",
    (entityType) => {
      const segments = [
        entityType,
        "intro",
        "日本語",
        "Cafe\u0301",
        "intro.md",
        " chapter ",
      ];
      const paths = new Set<string>();
      const ids = new Set<string>();
      const candidates = segments.map((segment) => [segment]);
      if (entityType !== "note") {
        for (const first of segments)
          for (const second of segments) {
            candidates.push([first, second]);
            for (const third of segments)
              candidates.push([first, second, third]);
          }
      }
      const extension =
        entityType === "image"
          ? ".png"
          : entityType === "document"
            ? ".pdf"
            : ".md";
      for (const candidate of candidates) {
        const id = encodeEntityIdPath(entityIdPathSchema.parse(candidate));
        const path = buildEntityFilePath("/content", id, entityType, extension);
        expect(ids.has(id)).toBe(false);
        expect(paths.has(path)).toBe(false);
        ids.add(id);
        paths.add(path);
        expect(parseEntityPath("/content", path)).toEqual({ entityType, id });
        expect(
          resolveEntityPlacement("/content", entityType, id, extension)
            .writable,
        ).toBe(true);
      }
    },
  );

  test("a type-prefixed ID is a separate destination, not an alias", async () => {
    const dir = await mkdtemp(join(tmpdir(), "injective-placement-"));
    try {
      const files = new FileOperations(dir, {
        serializeEntity: (entity): string => entity.content,
        hasEntityType: (): never => {
          throw new Error("placement must not consult the registry");
        },
      });
      const first = createTestEntity("site-content", {
        id: "home:hero",
        content: "Original protected content",
      });
      const second = createTestEntity("site-content", {
        id: "site-content:home:hero",
        content: "Independent content",
      });
      await files.writeEntity(first);
      await files.writeEntity(second);
      expect(
        await readFile(join(dir, "site-content/home/hero.md"), "utf8"),
      ).toBe(first.content);
      expect(
        await readFile(
          join(dir, "site-content/site-content/home/hero.md"),
          "utf8",
        ),
      ).toBe(second.content);
      await files.deleteEntityFiles(second.entityType, second.id);
      expect(await readFile(files.getEntityFilePath(first), "utf8")).toBe(
        first.content,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test.each([
    ["note", "book:intro"],
    ["note", "note:book:intro"],
    ["section", "home::hero"],
    ["section", "home/hero"],
    ["section", "home\\hero"],
    ["section", "home:.:hero"],
    ["section", "home:..:hero"],
    ["section", "bad\u0000id"],
    ["section", "."],
    ["section", ".."],
    ["section", ""],
    ["image", "gallery::cover"],
    ["document", "book::chapter"],
  ])(
    "%s/%s is refused before writes, sidecars, cleanup or deletion",
    async (entityType, id) => {
      const dir = await mkdtemp(join(tmpdir(), "refused-placement-"));
      try {
        const files = new FileOperations(dir, {
          serializeEntity: (): never => {
            throw new Error("must refuse before serialization");
          },
          hasEntityType: (): never => {
            throw new Error("must not consult registry");
          },
        });
        // Include an obsolete image representation and a document sidecar: no
        // effect may occur before the placement check, including cleanup.
        for (const path of [
          "section/home/hero.md",
          "image/gallery/cover.md",
          "document/book/chapter.pdf.metadata.json",
        ]) {
          await mkdir(join(dir, path, ".."), { recursive: true });
          await writeFile(join(dir, path), "Protected");
        }
        const before = (await readdir(dir, { recursive: true })).sort();
        const entity = createTestEntity(entityType, {
          id,
          content: "Replacement",
        });
        const writeError = await files
          .writeEntity(entity)
          .catch((error: unknown) => error);
        const deleteError = await files
          .deleteEntityFiles(entityType, id)
          .catch((error: unknown) => error);
        expect(writeError).toBeInstanceOf(EntityPlacementError);
        expect(deleteError).toBeInstanceOf(EntityPlacementError);
        expect(writeError).toMatchObject({
          entityType,
          entityId: id,
          owner: parseEntityPath(dir, files.getEntityFilePath(entity)),
        });
        expect((await readdir(dir, { recursive: true })).sort()).toEqual(
          before,
        );
        expect(
          await readFile(join(dir, "image/gallery/cover.md"), "utf8"),
        ).toBe("Protected");
        expect(
          await readFile(
            join(dir, "document/book/chapter.pdf.metadata.json"),
            "utf8",
          ),
        ).toBe("Protected");
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );

  test("a nested note names the type and identity its path reads as", () => {
    expect(resolveEntityPlacement("/content", "note", "book:intro")).toEqual({
      relativePath: "book/intro.md",
      owner: { entityType: "book", id: "intro" },
      writable: false,
    });
  });
});
