import type { StoredForm } from "./stored-form";

/**
 * How a type's records are stored as files (docs/plans/one-stored-form.md,
 * YAML files): as markdown, the default, or as YAML, for a type whose
 * record is data with no body. A YAML type's stored row keeps the framed
 * document every reader reads; its file is the document's header, written
 * as YAML once the store writes the next form.
 */
export type StorageFormat = "markdown" | "yaml";

const FRAMED = /^---\n([\s\S]*?)^---\n?([\s\S]*)$/mu;

/** The extension a type's text files take in the stored form `form`. */
export function storedFileExtension(
  storage: StorageFormat | undefined,
  form: StoredForm,
): ".md" | ".yaml" {
  return storage === "yaml" && form === "new" ? ".yaml" : ".md";
}

/** A stored document's file as YAML: its header, which is all it holds. */
export function yamlFileOf(content: string): string {
  const framed = FRAMED.exec(content);
  if (!framed) throw new Error("A YAML file holds a stored document's header");
  const [, header = "", body = ""] = framed;
  if (body.trim() !== "")
    throw new Error("A YAML file holds no body; this document has one");
  return header;
}

/** A YAML file read as the stored document it holds the header of. */
export function contentOfYamlFile(text: string): string {
  const header = text.endsWith("\n") ? text : `${text}\n`;
  return `---\n${header}---\n`;
}
