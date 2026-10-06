import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { z } from "@brains/utils/zod";
import { ASK_STYLED_ATTRIBUTE } from "@brains/contracts";

const packageRoot = join(import.meta.dir, "..");
const packageJsonPath = join(packageRoot, "package.json");
const buildScriptPath = join(packageRoot, "scripts", "build-ui.ts");

const webChatPackageJsonSchema = z.looseObject({
  files: z.array(z.string()),
  scripts: z.record(z.string(), z.string()),
  dependencies: z.record(z.string(), z.string()),
});

/** Splits a selector list on its top-level commas, leaving :is(a, b) whole. */
function splitSelectorList(list: string): string[] {
  return Array.from(list).reduce<{ depth: number; parts: string[] }>(
    ({ depth, parts }, char) => {
      if (char === "," && depth === 0) return { depth, parts: [...parts, ""] };
      const next = depth + (char === "(" ? 1 : char === ")" ? -1 : 0);
      return {
        depth: next,
        parts: [...parts.slice(0, -1), `${parts.at(-1) ?? ""}${char}`],
      };
    },
    { depth: 0, parts: [""] },
  ).parts;
}

describe("Web chat UI contract", () => {
  it("keeps the lazy guest bundle below its compressed size budget", () => {
    const asset = readFileSync(join(packageRoot, "dist", "ui", "guest.js"));
    expect(asset.toString()).toContain("mountGuestBox");
    // Catch accidental inclusion of disabled diagram/highlighting plugins.
    expect(Bun.gzipSync(asset).byteLength).toBeLessThan(600_000);
  });
  it("styles a mounted box only in hosts that opt in, beneath any host rule", () => {
    const source = readFileSync(
      join(packageRoot, "ui-react", "src", "guest-box.css"),
      "utf-8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // Keyframe steps (from, to) are not selectors.
      .replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
    const selectors = Array.from(source.matchAll(/([^{};]+)\{/g), (match) =>
      (match[1] ?? "").trim(),
    ).filter((selector) => !selector.startsWith("@"));
    expect(selectors.length).toBeGreaterThan(20);
    for (const selector of selectors) {
      // The whole list sits in :where(), and each selector in it opts in.
      const list = /^:where\((.*)\)$/s.exec(selector)?.[1];
      expect(list).toBeDefined();
      for (const part of splitSelectorList(list ?? ""))
        expect(part.trim()).toStartWith(`[${ASK_STYLED_ATTRIBUTE}]`);
    }
    for (const asset of ["guest.css", "dashboard.css"])
      expect(
        readFileSync(join(packageRoot, "dist", "ui", asset), "utf-8"),
      ).toContain(`[${ASK_STYLED_ATTRIBUTE}]`);
  });
  it("mounts a box with nothing to show in the room its host's composer took", () => {
    const source = readFileSync(
      join(packageRoot, "ui-react", "src", "guest-box.css"),
      "utf-8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    // Selectors are compared without their line breaks and indentation.
    const rules = Array.from(
      source.matchAll(/([^{};]+)\{([^{}]*)\}/g),
      (match) => ({
        selector: (match[1] ?? "").replace(/\s+/g, ""),
        body: match[2] ?? "",
      }),
    );
    // An empty welcome area: no padding under nothing, no fade over nothing.
    const scroll = rules.find(
      (rule) =>
        rule.selector.includes(".brain-box-scroll.is-welcome:not(:has(") &&
        rule.body.includes("padding-bottom: 0"),
    );
    expect(scroll?.body).toContain("mask-image: none");
    // And no divider or gap above the composer until there is something above it.
    const bottom = rules.find(
      (rule) =>
        rule.selector.includes(".brain-box-bottom") &&
        rule.selector.includes(".is-welcome:not(:has(") &&
        rule.body.includes("margin-top: 0"),
    );
    expect(bottom?.body).toContain("padding-top: 0");
    expect(bottom?.selector).toContain(":not(.is-sheet)");
  });

  it("publishes the built UI asset directory", () => {
    const packageJson = webChatPackageJsonSchema.parse(
      JSON.parse(readFileSync(packageJsonPath, "utf-8")),
    );

    expect(packageJson.scripts["build"]).toBe("bun scripts/build-ui.ts");
    expect(packageJson.files).toContain("dist");
    expect(packageJson.files).toContain("src");
  });

  it("keeps React and React DOM on the same declared range", () => {
    const packageJson = webChatPackageJsonSchema.parse(
      JSON.parse(readFileSync(packageJsonPath, "utf-8")),
    );

    const reactVersion = packageJson.dependencies["react"];
    const reactDomVersion = packageJson.dependencies["react-dom"];

    if (!reactVersion || !reactDomVersion) {
      throw new Error("web-chat must declare react and react-dom dependencies");
    }

    expect(reactVersion).toBe(reactDomVersion);
  });

  it("builds only the three guest bundles, with no retired operator assets", () => {
    const buildScript = readFileSync(buildScriptPath, "utf-8");
    expect(buildScript).not.toContain('["main", "app"]');
    for (const [entry, asset] of [
      ["guest-box", "guest"],
      ["guest-page", "ask"],
      ["guest-dashboard", "dashboard"],
    ]) {
      expect(buildScript).toContain(
        JSON.stringify([entry, asset]).replace(",", ", "),
      );
    }
    expect(readdirSync(join(packageRoot, "dist", "ui")).sort()).toEqual(
      ["guest", "ask", "dashboard"]
        .flatMap((asset) => [asset + ".js", asset + ".css", asset + ".js.map"])
        .sort(),
    );
    expect(buildScript).toContain("createStylexBunTransform");
    expect(buildScript).toMatch(
      /writeBuildFileAtomically\s*\(\s*join\(outdir,\s*`\$\{assetName\}\.css`\)/,
    );
    expect(buildScript).toContain('["guest-box", "guest"]');
    expect(buildScript).toContain("outdir: staging");
    const css = readFileSync(
      join(packageRoot, "dist", "ui", "guest.css"),
      "utf-8",
    );
    expect(css).not.toContain("insertRule");
  });

  it("dedupes React entrypoints in the UI build config", () => {
    const buildScript = readFileSync(buildScriptPath, "utf-8");

    expect(buildScript).toContain('name: "dedupe-react"');
    expect(buildScript).toContain('require.resolve("react/package.json")');
    expect(buildScript).toContain('require.resolve("react-dom/package.json")');
    expect(buildScript).toContain('"react/jsx-runtime"');
    expect(buildScript).toContain('"react/jsx-dev-runtime"');
    expect(buildScript).toContain('"react-dom/client"');
  });
});
