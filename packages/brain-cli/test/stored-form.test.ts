import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createServicePluginContext, type Plugin } from "@brains/plugins";
import { isDeclaredEntityType } from "@brains/plugins/test";
import siteInfoPackage from "@brains/site-info";
import { fetchSiteInfo, siteMetadataContract } from "@brains/site-composition";
import { readMarkdownFrontmatter } from "@brains/utils/markdown-frontmatter";
import { canonicalBrain } from "../src/model/canonical-brain";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The stored-form contract (docs/external-plugin-authoring.md, The stored format). Every type the
 * canonical brain registers, and the two the shell registers, stores one
 * form: its header holds only what Obsidian shows as a property, and the
 * bytes it stores are the same on every path, in the order of the document
 * they replace, with no default written and unknown keys kept.
 *
 * A moved type is tested in the new form it writes, from a file in either
 * form. A type not yet moved is pending:
 * the list is empty at alpha W. A type added later fails here until it is
 * moved or listed, so it is covered without a new test.
 */

/** The types the shell registers itself, not through a capability. */
const SHELL_TYPES = ["anchor-profile", "brain-character"] as const;

/** Binary types: their stored content is bytes, with no header. */
const BINARY = new Set(["document", "image"]);

/** Moved, with golden files in the old and the new form. */
const MOVED = new Set(["site-info"]);

/** Not yet moved; each phase of the plan takes its types off this list. */
const PENDING = new Set([
  "action-item",
  "agent",
  "anchor-profile",
  "ask-content",
  "book",
  "book-section",
  "brain-character",
  "conflict",
  "contact-request",
  "decision",
  "deck",
  "doc",
  "faq",
  "form",
  "grouping-definitions",
  "guide",
  "link",
  "mail-item",
  "newsletter",
  "note",
  "playbook",
  "post",
  "project",
  "prompt",
  "quiz-result",
  "reference",
  "refined-note",
  "seminar",
  "series",
  "shared-copy",
  "site-content",
  "skill",
  "social-post",
  "style-guide",
  "summary",
  "swot",
  "topic",
  "traffic-snapshot",
  "wish",
]);

/** Every entity type the canonical brain and its shell register. */
function registeredTypes(): Set<string> {
  const types = new Set<string>(SHELL_TYPES);
  for (const [, factory, defaults] of canonicalBrain.capabilities) {
    let plugins: Plugin | Plugin[];
    try {
      plugins = factory(typeof defaults === "function" ? {} : (defaults ?? {}));
    } catch {
      // A capability whose defaults need a deployment's config (the OAuth
      // broker) registers no entity type.
      continue;
    }
    for (const plugin of [plugins].flat()) {
      if (isDeclaredEntityType(plugin)) types.add(plugin.entityType);
    }
  }
  return types;
}

const golden = async (type: string, form: "old" | "new"): Promise<string> =>
  readFile(
    join(import.meta.dir, "fixtures", "stored-form", type, `${form}.md`),
    "utf8",
  );

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

function header(markdown: string): Record<string, unknown> {
  const { data } = readMarkdownFrontmatter(markdown);
  return typeof data === "object" && data !== null ? { ...data } : {};
}

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

const SITE_INFO = { entityType: "site-info", id: "site-info" } as const;

async function siteInfoStore(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    siteInfoPackage,
    "@brains/site-info",
    "site-metadata",
    {
      classification: "system",
      embeddable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    },
    [],
    {},
    () => {},
  );
  stores.push(opened);
  return opened;
}

async function stored(opened: DeclaredEntityStore): Promise<string> {
  const row = await opened.stored(SITE_INFO.entityType, SITE_INFO.id);
  if (!row) throw new Error("No site-info row");
  return row.content;
}

/** A file imported as directory sync imports one: the whole document. */
async function imported(
  opened: DeclaredEntityStore,
  markdown: string,
): Promise<string> {
  const existing = await opened.service.getEntity({
    ...SITE_INFO,
    visibilityScope: "restricted",
  });
  if (!existing) {
    await opened.service.createEntityFromMarkdown({
      input: { ...SITE_INFO, markdown },
    });
    return stored(opened);
  }
  const parsed = opened.service.deserializeEntity(markdown, "site-info");
  await opened.service.upsertEntity({
    entity: {
      ...existing,
      ...parsed,
      content: markdown,
      metadata: parsed.metadata ?? {},
    },
  });
  return stored(opened);
}

async function readers(opened: DeclaredEntityStore): Promise<unknown> {
  return {
    fetched: await fetchSiteInfo(opened.service),
    answered: await createServicePluginContext(
      opened.shell,
      "site-builder",
    ).messaging.request(siteMetadataContract, {}),
  };
}

describe("the stored-form contract", () => {
  test("covers every registered type: moved, pending or binary", () => {
    const types = registeredTypes();
    expect(
      [...types].filter(
        (type) => !MOVED.has(type) && !PENDING.has(type) && !BINARY.has(type),
      ),
    ).toEqual([]);
    // A listed type that is no longer registered is a stale entry.
    expect(
      [...MOVED, ...PENDING, ...BINARY].filter((type) => !types.has(type)),
    ).toEqual([]);
  });
});

describe("site-info, in the new form", () => {
  test("its header holds only Obsidian properties", async () => {
    const opened = await siteInfoStore();
    const written = await imported(opened, await golden("site-info", "old"));
    expect(
      Object.entries(header(written)).filter(
        ([, value]) => !isPropertyValue(value),
      ),
    ).toEqual([]);
  });

  test("an old-form and a new-form file store the same bytes", async () => {
    const fromOld = await siteInfoStore();
    const fromNew = await siteInfoStore();
    expect(await imported(fromOld, await golden("site-info", "old"))).toBe(
      await golden("site-info", "new"),
    );
    expect(await imported(fromNew, await golden("site-info", "new"))).toBe(
      await golden("site-info", "new"),
    );
  });

  test("writing back what a read returned changes no byte", async () => {
    const opened = await siteInfoStore();
    const expected = await imported(opened, await golden("site-info", "new"));

    const read = await opened.service.getEntity(SITE_INFO);
    if (!read) throw new Error("No site-info");
    await opened.service.updateEntity({ entity: read });
    expect(await stored(opened)).toBe(expected);

    const source = await opened.service.getEntity({
      ...SITE_INFO,
      source: true,
    });
    if (!source) throw new Error("No site-info");
    await opened.service.updateEntity({ entity: source });
    expect(await stored(opened)).toBe(expected);
  });

  test("a visibility change writes only the visibility line", async () => {
    const opened = await siteInfoStore();
    const expected = await imported(opened, await golden("site-info", "new"));
    const read = await opened.service.getEntity(SITE_INFO);
    if (!read) throw new Error("No site-info");

    await opened.service.updateEntity({
      entity: { ...read, visibility: "restricted" },
    });
    expect(await stored(opened)).toBe(
      expected.replace(
        "ctaButtonLink: /#quickstart\n---",
        "ctaButtonLink: /#quickstart\nvisibility: restricted\n---",
      ),
    );

    const restricted = await opened.service.getEntity({
      ...SITE_INFO,
      visibilityScope: "restricted",
    });
    if (!restricted) throw new Error("No site-info");
    await opened.service.updateEntity({
      entity: { ...restricted, visibility: "public" },
    });
    expect(await stored(opened)).toBe(expected);
  });

  test("keeps the key order of the file it imports", async () => {
    const opened = await siteInfoStore();
    const reordered = (await golden("site-info", "new")).replace(
      "title: Rizom\ndescription: Build the agent that represents you.\ncopyright: © 2026 Rizom\nthemeMode: dark\n",
      "themeMode: dark\ncopyright: © 2026 Rizom\ntitle: Rizom\ndescription: Build the agent that represents you.\n",
    );
    expect(await imported(opened, reordered)).toBe(reordered);
  });

  test("writes no default the file did not state, and keeps one it did", async () => {
    const opened = await siteInfoStore();
    const written = await imported(opened, await golden("site-info", "new"));
    expect(header(written)).not.toHaveProperty("represents");
    expect(
      (await opened.service.getEntity(SITE_INFO))?.metadata["represents"],
    ).toBe("anchor");

    const stating = (await golden("site-info", "new")).replace(
      "---\ntitle:",
      "---\nrepresents: anchor\ntitle:",
    );
    expect(await imported(opened, stating)).toBe(stating);
  });

  test("keeps a key the type does not name, and says so", async () => {
    const opened = await siteInfoStore();
    const unknown = (await golden("site-info", "new")).replace(
      "themeMode: dark\n",
      "themeMode: dark\npinned: true\n",
    );
    expect(await imported(opened, unknown)).toBe(unknown);
    expect(opened.service.unknownFrontmatterKeys(unknown, "site-info")).toEqual(
      ["pinned"],
    );
  });
});

describe("site-info, from the old form to the new", () => {
  test("both forms decode to the same metadata", async () => {
    const opened = await siteInfoStore();
    expect(
      opened.service.deserializeEntity(
        await golden("site-info", "old"),
        "site-info",
      ).metadata,
    ).toEqual(
      opened.service.deserializeEntity(
        await golden("site-info", "new"),
        "site-info",
      ).metadata,
    );
  });

  test("its readers return the same values from either form", async () => {
    const fromOld = await siteInfoStore();
    await imported(fromOld, await golden("site-info", "old"));
    const fromNew = await siteInfoStore();
    await imported(fromNew, await golden("site-info", "new"));
    expect(await readers(fromOld)).toEqual(await readers(fromNew));
  });

  test("the rewrite on start stores the new form quietly, once", async () => {
    const opened = await siteInfoStore();
    await imported(opened, await golden("site-info", "new"));
    const old = await golden("site-info", "old");
    // The row as alpha R stored it, last written a while ago.
    await opened.rewrite("site-info", "site-info", old, "{}");
    await opened.service.reconcileDeclaredMetadata();
    await opened.setCreated("site-info", "site-info", Date.UTC(2026, 0, 1));
    const before = await opened.stored("site-info", "site-info");

    expect(await opened.service.rewriteStoredForms()).toMatchObject({
      rewritten: 1,
    });

    const after = await opened.stored("site-info", "site-info");
    expect(after?.content).toBe(await golden("site-info", "new"));
    expect(after?.updated).toBe(before?.updated);
    expect(after?.metadata).toBe(before?.metadata);
    // A second start rewrites nothing.
    expect(await opened.service.rewriteStoredForms()).toMatchObject({
      rewritten: 0,
    });
    expect((await opened.stored("site-info", "site-info"))?.content).toBe(
      await golden("site-info", "new"),
    );
  });

  test("an edited old-form file is imported, not overwritten", async () => {
    const opened = await siteInfoStore();
    await imported(opened, await golden("site-info", "old"));
    const edited = (await golden("site-info", "old")).replace(
      "heading: Build your brain",
      "heading: Start your brain",
    );

    expect(await imported(opened, edited)).toBe(
      (await golden("site-info", "new")).replace(
        "ctaHeading: Build your brain",
        "ctaHeading: Start your brain",
      ),
    );
  });
});
