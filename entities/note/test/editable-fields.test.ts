import { describe, expect, it } from "bun:test";
import { editableFieldsOf } from "@brains/entity-service";
import { noteFrontmatterSchema } from "../src/schemas/note";

describe("a note's editable fields", () => {
  it("are its title; its status and error record its generation", () => {
    expect(Object.keys(editableFieldsOf(noteFrontmatterSchema).shape)).toEqual([
      "title",
    ]);
  });
});
