import { describe, expect, it } from "bun:test";
import { editableFieldsOf } from "@brains/entity-service";
import { documentMetadataSchema } from "../src/schemas/document";

describe("a document's editable fields", () => {
  it("are its title; the rest is the brain's record of the file", () => {
    expect(Object.keys(editableFieldsOf(documentMetadataSchema).shape)).toEqual(
      ["title"],
    );
  });
});
