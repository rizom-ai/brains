import { describe, expect, test } from "bun:test";
import { sectionGroupToTemplates } from "@brains/site-composition";
import site from "../src";

describe("the brain can store every section's copy", () => {
  test("derives markdown headings for every section group", () => {
    for (const group of [site.sections ?? []].flat()) {
      expect(() => sectionGroupToTemplates(group)).not.toThrow();
    }
  });
});
