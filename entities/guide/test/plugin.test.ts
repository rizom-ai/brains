import { describe, expect, it } from "bun:test";
import { createMockShell } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import { guideDataSourceOn, installGuides } from "./guide-plugins";

describe("the guide package", () => {
  it("hands its configured chrome to the guide pages, and none by default", async () => {
    const chrome = { brand: { label: "brains docs", href: "/docs" } };
    for (const [config, expected] of [
      [{ chrome }, chrome],
      [{}, undefined],
    ] as const) {
      const shell = createMockShell();
      await installGuides(shell, config);
      const schema = shell.getTemplates().get("guides:guide-list")?.schema;
      if (!schema) throw new Error("guides not registered");
      const page = z.record(z.string(), z.unknown()).parse(
        await guideDataSourceOn(shell, "guides:entities").fetch({}, schema, {
          entityService: shell.getEntityService(),
        }),
      );
      if (expected) expect(page["chrome"]).toMatchObject(expected);
      else expect(page["chrome"]).toBeNull();
    }
  });
});
