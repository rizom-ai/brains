import { describe, expect, it } from "bun:test";
import {
  contentOfYamlFile,
  storedFileExtension,
  yamlFileOf,
} from "../src/yaml-storage";

/**
 * A YAML type's file (docs/plans/one-stored-form.md, YAML files): the
 * header of its stored document, without the markdown delimiters. The
 * stored row keeps the framed document, so every reader reads it as
 * before; only the file is YAML, and only once the store writes the next
 * form.
 */
describe("a YAML type's file", () => {
  const content =
    "---\ngroupings:\n  clients:\n    label: Clients\nvisibility: shared\n---\n";
  const file =
    "groupings:\n  clients:\n    label: Clients\nvisibility: shared\n";

  it("is the stored document's header, byte for byte", () => {
    expect(yamlFileOf(content)).toBe(file);
  });

  it("reads back as the stored document", () => {
    expect(contentOfYamlFile(file)).toBe(content);
    expect(contentOfYamlFile(file.trimEnd())).toBe(content);
  });

  it("refuses a document with a body, which a YAML file cannot hold", () => {
    expect(() => yamlFileOf("---\ntitle: T\n---\nBody\n")).toThrow();
  });

  it("is .yaml only for a YAML type in the next form", () => {
    expect(storedFileExtension("yaml", "new")).toBe(".yaml");
    expect(storedFileExtension("yaml", "old")).toBe(".md");
    expect(storedFileExtension(undefined, "new")).toBe(".md");
    expect(storedFileExtension("markdown", "new")).toBe(".md");
  });
});
