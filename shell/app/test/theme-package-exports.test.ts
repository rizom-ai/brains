import { describe, expect, test } from "bun:test";

const themeIndexFiles = [
  "../../../shared/theme-default/src/index.ts",
  "../../../shared/theme-rizom/src/index.ts",
  "../../../shared/theme-brutalist/src/index.ts",
] as const;

describe("theme package exports", () => {
  test("theme packages export raw CSS instead of composing it", async () => {
    for (const relativePath of themeIndexFiles) {
      const source = await Bun.file(
        new URL(relativePath, import.meta.url),
      ).text();

      expect(source).toContain("export default");
      expect(source).not.toContain("composeTheme");
      expect(source).not.toContain('from "@brains/theme-base"');
    }
  });
});
