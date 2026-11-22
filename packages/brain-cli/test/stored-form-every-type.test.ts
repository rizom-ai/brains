import { contentOfYamlFile, yamlFileOf } from "@brains/entity-service";
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  generateMarkdown,
  readMarkdownFrontmatter,
} from "@brains/utils/markdown-frontmatter";
import {
  canonicalEntityStore,
  type CanonicalEntityStore,
} from "./helpers/canonical-entity-store";

/**
 * The form every text type stores (docs/external-plugin-authoring.md, The stored format):
 * the same bytes on every path, in the order of the document they replace,
 * unknown keys kept. Each type's golden file (fixtures/stored-form/<type>/
 * current.md) is the form it writes now; every write path must leave it
 * byte for byte. A type the canonical brain registers without a golden
 * file fails here, so a type added later is covered.
 */

const GOLDEN = join(import.meta.dir, "fixtures", "stored-form");

/**
 * Types whose header refuses a key it does not name: records the brain
 * writes from public intake or mail, and the form definitions behind them.
 * A file with such a key is refused and set aside, never stored with the
 * key dropped, so nothing is lost silently.
 */
const STRICT_HEADER = new Set([
  "contact-request",
  "form",
  "mail-item",
  "quiz-result",
]);

interface Golden {
  type: string;
  id: string;
  /** The stored document the release writes. */
  markdown: string;
  /**
   * The form an earlier release wrote, for a type whose layout moved
   * (docs/external-plugin-authoring.md, The stored format): read, and brought to the current form.
   */
  previous?: string;
  /** A YAML type's file, whose header the stored document is. */
  yaml?: string;
}

const goldens: Golden[] = readdirSync(GOLDEN)
  .filter(
    (type) =>
      existsSync(join(GOLDEN, type, "current.md")) ||
      existsSync(join(GOLDEN, type, "current.yaml")),
  )
  .sort()
  .map((type) => ({
    type,
    id: readFileSync(join(GOLDEN, type, "id.txt"), "utf8").trim(),
    ...currentOf(type),
    ...(existsSync(join(GOLDEN, type, "previous.md")) && {
      previous: readFileSync(join(GOLDEN, type, "previous.md"), "utf8"),
    }),
  }));

/** A document as a type stores it: a YAML type's, its header alone. */
function asStored(golden: Golden, markdown: string): string {
  return golden.yaml === undefined
    ? markdown
    : contentOfYamlFile(yamlFileOf(markdown));
}

/** A type's current golden: its markdown, or its YAML file and the document it holds. */
function currentOf(type: string): { markdown: string; yaml?: string } {
  const yamlPath = join(GOLDEN, type, "current.yaml");
  if (!existsSync(yamlPath))
    return {
      markdown: readFileSync(join(GOLDEN, type, "current.md"), "utf8"),
    };
  const yaml = readFileSync(yamlPath, "utf8");
  return { yaml, markdown: contentOfYamlFile(yaml) };
}

function header(markdown: string): Record<string, unknown> {
  const { data } = readMarkdownFrontmatter(markdown);
  return typeof data === "object" && data !== null ? { ...data } : {};
}

function body(markdown: string): string {
  return readMarkdownFrontmatter(markdown).content;
}

/** The golden with its header rebuilt: keys reordered, or one added. */
function withHeader(
  markdown: string,
  change: (fields: Record<string, unknown>) => Record<string, unknown>,
): string {
  return generateMarkdown(change(header(markdown)), body(markdown));
}

let store: CanonicalEntityStore | undefined;
afterEach(async () => {
  await store?.close();
  store = undefined;
});

async function opened(): Promise<CanonicalEntityStore> {
  store = await canonicalEntityStore();
  return store;
}

/** Whether a header value is one Obsidian shows as a property. */
function isPropertyValue(value: unknown): boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Date ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

async function imported(
  opened: CanonicalEntityStore,
  golden: Golden,
  markdown: string,
): Promise<string> {
  const { service } = opened;
  const existing = await service.getEntity({
    entityType: golden.type,
    id: golden.id,
    visibilityScope: "restricted",
  });
  if (!existing) {
    await service.createEntityFromMarkdown({
      input: { entityType: golden.type, id: golden.id, markdown },
    });
  } else {
    // A file imported over its row, as directory sync imports one.
    const parsed = service.deserializeEntity(markdown, golden.type);
    await service.upsertEntity({
      entity: {
        ...existing,
        ...parsed,
        content: markdown,
        metadata: parsed.metadata ?? {},
        visibility: parsed.visibility ?? "public",
      },
    });
  }
  const row = await opened.stored(golden.type, golden.id);
  if (!row) throw new Error(`No ${golden.type} row`);
  return row.content;
}

describe("every text type's stored form", () => {
  test("every text type the canonical brain registers has a golden file", async () => {
    const { textTypes } = await opened();
    expect(
      textTypes.filter((type) => !goldens.some((g) => g.type === type)),
    ).toEqual([]);
  });

  describe.each(goldens.map((golden) => [golden.type, golden] as const))(
    "%s",
    (_, golden) => {
      test("stores its golden file byte for byte", async () => {
        const opened_ = await opened();
        expect(await imported(opened_, golden, golden.markdown)).toBe(
          golden.markdown,
        );
      });

      test("is framed the same however the file was spaced", async () => {
        const opened_ = await opened();
        const spaced = golden.markdown
          .replace(/\n---\n/u, "\n---\n\n")
          .concat("\n\n");
        expect(await imported(opened_, golden, spaced)).toBe(golden.markdown);
      });

      test("writing back what a read returned changes no byte", async () => {
        const opened_ = await opened();
        await imported(opened_, golden, golden.markdown);
        const visibilityScope = "restricted" as const;
        for (const source of [false, true]) {
          const read = await opened_.service.getEntity({
            entityType: golden.type,
            id: golden.id,
            visibilityScope,
            ...(source && { source: true }),
          });
          if (!read) throw new Error(`No ${golden.type}`);
          await opened_.service.updateEntity({ entity: read });
          expect((await opened_.stored(golden.type, golden.id))?.content).toBe(
            golden.markdown,
          );
        }
      });

      test("keeps the key order of the file it imports", async () => {
        const opened_ = await opened();
        await imported(opened_, golden, golden.markdown);
        // Reversed, visibility last where the record writes it.
        const reversed = withHeader(golden.markdown, (fields) => {
          const { visibility, ...rest } = fields;
          return {
            ...Object.fromEntries(Object.entries(rest).reverse()),
            ...(visibility !== undefined && { visibility }),
          };
        });
        expect(await imported(opened_, golden, reversed)).toBe(
          asStored(golden, reversed),
        );
      });

      test.if(STRICT_HEADER.has(golden.type))(
        "refuses a key its type does not name, and leaves its row as stored",
        async () => {
          const opened_ = await opened();
          await imported(opened_, golden, golden.markdown);
          const unknown = withHeader(golden.markdown, (fields) => ({
            ...fields,
            zzKeptKey: "kept",
          }));
          expect(imported(opened_, golden, unknown)).rejects.toThrow(
            "zzKeptKey",
          );
          expect((await opened_.stored(golden.type, golden.id))?.content).toBe(
            golden.markdown,
          );
        },
      );

      test.if(!STRICT_HEADER.has(golden.type))(
        "keeps a key its type does not name, and says so",
        async () => {
          const opened_ = await opened();
          const unknown = withHeader(golden.markdown, (fields) => {
            const { visibility, ...rest } = fields;
            return {
              ...rest,
              zzKeptKey: "kept",
              ...(visibility !== undefined && { visibility }),
            };
          });
          expect(await imported(opened_, golden, unknown)).toBe(
            asStored(golden, unknown),
          );
          expect(
            opened_.service.unknownFrontmatterKeys(unknown, golden.type),
          ).toContain("zzKeptKey");
        },
      );
    },
  );
});

/**
 * A type whose layout moved (docs/external-plugin-authoring.md, The stored format) has a
 * previous.md golden beside its current one: it reads the previous form as
 * the current, writes the current from either file, and the rewrite on
 * start brings a row stored in the previous form to the current once,
 * quietly.
 */
const moved = goldens.filter(
  (golden): golden is Golden & { previous: string } =>
    golden.previous !== undefined,
);

describe.each(moved.map((golden) => [golden.type, golden] as const))(
  "%s, from its previous form",
  (_, golden) => {
    test.skipIf(golden.yaml === undefined)(
      "a YAML type's file is the golden",
      async () => {
        const opened_ = await opened();
        const written = await imported(opened_, golden, golden.previous);
        expect(yamlFileOf(written)).toBe(golden.yaml ?? "");
        expect(opened_.service.fileExtension(golden.type)).toBe(".yaml");
      },
    );

    test("both forms decode to the same fields", async () => {
      const { service } = await opened();
      expect(
        service.deserializeEntity(golden.previous, golden.type).metadata,
      ).toEqual(
        service.deserializeEntity(golden.markdown, golden.type).metadata,
      );
    });

    test("the current form is written from either file", async () => {
      const opened_ = await opened();
      expect(await imported(opened_, golden, golden.previous)).toBe(
        golden.markdown,
      );
      expect(await imported(opened_, golden, golden.markdown)).toBe(
        golden.markdown,
      );
    });

    // A YAML file is data, edited as text; only a markdown header is shown
    // as properties.
    test.skipIf(golden.yaml !== undefined)(
      "the current form's header holds only Obsidian properties",
      () => {
        expect(
          Object.entries(header(golden.markdown)).filter(
            ([, value]) => !isPropertyValue(value),
          ),
        ).toEqual([]);
      },
    );

    test("the rewrite on start brings a row to the current form once, quietly", async () => {
      const opened_ = await opened();
      await imported(opened_, golden, golden.markdown);
      await opened_.storeAsBefore(golden.type, golden.id, golden.previous);
      const before = await opened_.stored(golden.type, golden.id);

      expect(await opened_.service.rewriteStoredForms()).toMatchObject({
        rewritten: 1,
      });
      const after = await opened_.stored(golden.type, golden.id);
      expect(after?.content).toBe(golden.markdown);
      expect(after?.updated).toBe(before?.updated);
      expect(await opened_.service.rewriteStoredForms()).toMatchObject({
        rewritten: 0,
      });
    });
  },
);
