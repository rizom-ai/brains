import { describe, expect, test } from "bun:test";
import { sectionGroupToTemplates } from "@brains/site-composition";
import site from "../src";

describe("the brain can store every section's copy", () => {
  test("derives markdown headings for every section group", () => {
    for (const group of [site.sections ?? []].flat()) {
      expect(() => sectionGroupToTemplates(group)).not.toThrow();
    }
  });

  test("reads every page's copy back as it was written, within six heading levels", () => {
    const templates = Object.fromEntries(
      [site.sections ?? []]
        .flat()
        .flatMap((group) =>
          Object.entries(sectionGroupToTemplates(group)).map(
            ([id, template]) => [`${group.namespace}:${id}`, template],
          ),
        ),
    );
    for (const route of site.routes) {
      for (const section of route.sections ?? []) {
        const template = section.template
          ? templates[section.template]
          : undefined;
        const content =
          section.content ?? site.content?.[route.id]?.[section.id];
        if (!template?.formatter || !content) continue;
        const schema = template.schema;
        const written = template.formatter.format(schema.parse(content));
        expect(written).not.toMatch(/^#{7,} /m);
        expect(schema.parse(template.formatter.parse(written))).toEqual(
          schema.parse(content),
        );
      }
    }
  });
});
