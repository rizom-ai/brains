import { describe, expect, it } from "bun:test";
import { editableFieldsOf } from "@brains/entity-service";
import { imageMetadataSchema } from "../src/schemas/image";

describe("an image's editable fields", () => {
  it("are its title and alt text; the rest is the brain's record of the file", () => {
    expect(Object.keys(editableFieldsOf(imageMetadataSchema).shape)).toEqual([
      "title",
      "alt",
    ]);
  });
});
