import { describe, expect, it } from "bun:test";
import { DavTree } from "../src/dav-tree";
import { entity, fakeReader } from "./fake-reader";

/**
 * A YAML type's file on the drive (docs/plans/one-stored-form.md, YAML
 * files): once its store writes the next form, a form is `form/<id>.yaml`,
 * the header of its stored document; before, it is `form/<id>.md`.
 */
const stored = "---\ntitle: Work with us\nsubmitLabel: Send\n---\n";
const contact = entity("form", "contact", { content: stored });

describe("a YAML type's file on the drive", () => {
  it("is the stored document's header, under .yaml, once the store writes YAML", async () => {
    const tree = new DavTree(
      fakeReader({ entities: [contact], yamlTypes: ["form"] }),
      "public",
    );
    const located = await tree.entityAt(["form", "contact.yaml"]);
    expect(located?.file.segments).toEqual(["form", "contact.yaml"]);
    expect(await located?.file.open()).toBe(
      "title: Work with us\nsubmitLabel: Send\n",
    );
    expect(await tree.entityAt(["form", "contact.md"])).toBeUndefined();
  });

  it("is the markdown document while the store writes the current form", async () => {
    const tree = new DavTree(fakeReader({ entities: [contact] }), "public");
    const located = await tree.entityAt(["form", "contact.md"]);
    expect(await located?.file.open()).toBe(stored);
    expect(await tree.entityAt(["form", "contact.yaml"])).toBeUndefined();
  });
});
