import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildThemePackage } from "../src/theme-package";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function createPackageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "theme-package-build-"));
  created.push(dir);
  return dir;
}

describe("buildThemePackage", () => {
  it("inlines the css into a dependency-free module", async () => {
    const packageDir = await createPackageDir();

    const result = buildThemePackage({
      packageDir,
      themeCSSOnly: ".a { color: red; }",
    });

    const js = await readFile(join(packageDir, "dist", "index.js"), "utf-8");
    expect(js).not.toMatch(/^import /m);
    expect(js).toContain(`const themeCSSOnly = ".a { color: red; }";`);
    expect(js).toContain("export default themeCSSOnly;");
    expect(js).toContain("export { themeCSSOnly };");
    expect(result.cssLength).toBe(".a { color: red; }".length);
  });

  it("declares the standalone module's types", async () => {
    const packageDir = await createPackageDir();

    buildThemePackage({ packageDir, themeCSSOnly: ".a {}" });

    expect(
      await readFile(join(packageDir, "dist", "index.d.ts"), "utf-8"),
    ).toBe(
      [
        "declare const themeCSSOnly: string;",
        "export default themeCSSOnly;",
        "export { themeCSSOnly };",
        "",
      ].join("\n"),
    );
  });

  it("escapes css that would otherwise break the emitted string literal", async () => {
    const packageDir = await createPackageDir();
    // Backticks and ${} are literal CSS content but template syntax in the
    // composed form; quotes and newlines break a naive quoted literal.
    const css = '.a::before { content: "`${x}`\n"; }';

    buildThemePackage({ packageDir, themeCSSOnly: css });

    const module = (await import(
      `${join(packageDir, "dist", "index.js")}?standalone`
    )) as { default: string };
    expect(module.default).toBe(css);
  });

  it("composes over a base package through a real import", async () => {
    const packageDir = await createPackageDir();

    buildThemePackage({
      packageDir,
      themeCSSOnly: ".own {}",
      base: { packageName: "@rizom/theme-default" },
    });

    const js = await readFile(join(packageDir, "dist", "index.js"), "utf-8");
    expect(js).toContain('import baseThemeCSS from "@rizom/theme-default";');
    expect(js).toContain("export default themeCSS;");
    expect(js).toContain("export { themeCSS, themeCSSOnly };");
  });

  it("strips the requested pattern from the base css", async () => {
    const packageDir = await createPackageDir();
    const baseDir = join(packageDir, "node_modules", "fake-base");
    await mkdir(baseDir, { recursive: true });
    await writeFile(
      join(baseDir, "index.js"),
      'export default "@import url(\\"https://fonts.example/x\\");\\n.base {}";\n',
    );
    await writeFile(
      join(baseDir, "package.json"),
      JSON.stringify({ name: "fake-base", type: "module", main: "index.js" }),
    );

    buildThemePackage({
      packageDir,
      themeCSSOnly: ".own {}",
      base: {
        packageName: "fake-base",
        stripPattern:
          /^@import url\("https:\/\/fonts\.example[^"]*"\);\r?\n?/gm,
      },
    });

    const module = (await import(
      `${join(packageDir, "dist", "index.js")}?composed`
    )) as { default: string; themeCSSOnly: string };
    expect(module.default).toBe(".base {}\n\n.own {}");
    expect(module.themeCSSOnly).toBe(".own {}");
  });

  it("declares the composed module's types", async () => {
    const packageDir = await createPackageDir();

    buildThemePackage({
      packageDir,
      themeCSSOnly: ".own {}",
      base: { packageName: "@rizom/theme-default" },
    });

    expect(
      await readFile(join(packageDir, "dist", "index.d.ts"), "utf-8"),
    ).toBe(
      [
        "declare const themeCSS: string;",
        "declare const themeCSSOnly: string;",
        "export default themeCSS;",
        "export { themeCSS, themeCSSOnly };",
        "",
      ].join("\n"),
    );
  });

  it("clears a stale dist before writing", async () => {
    const packageDir = await createPackageDir();
    const distDir = join(packageDir, "dist");
    await mkdir(distDir, { recursive: true });
    await writeFile(join(distDir, "stale.js"), "export default 1;");

    buildThemePackage({ packageDir, themeCSSOnly: ".a {}" });

    expect(existsSync(join(distDir, "stale.js"))).toBe(false);
    expect(existsSync(join(distDir, "index.js"))).toBe(true);
  });
});
