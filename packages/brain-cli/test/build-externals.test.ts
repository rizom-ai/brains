import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Regression guard: React and its renderer subpaths MUST be listed in the
 * `sharedExternals` array of `packages/brain-cli/scripts/build.ts`.
 *
 * Context and hooks require the component tree and renderer to resolve one
 * React instance. The CLI bundle, public library chunks, and consumer site
 * therefore share the consumer's installed runtime rather than embedding
 * independent copies.
 */
describe("brain-cli build config", () => {
  const buildScript = readFileSync(
    join(import.meta.dir, "..", "scripts", "build.ts"),
    "utf-8",
  );

  // Locate the `sharedExternals` array literal in the build script
  // and capture its contents. The regex is intentionally permissive
  // about whitespace/comments but strict about the variable name.
  const externalsMatch = buildScript.match(
    /const\s+sharedExternals\s*=\s*\[([\s\S]*?)\]/,
  );

  it("declares a sharedExternals array", () => {
    expect(externalsMatch).not.toBeNull();
  });

  const externalsBlock = externalsMatch?.[1] ?? "";

  it("externalizes the MCP server to preserve SDK class identity", () => {
    expect(externalsBlock).toMatch(/["']@modelcontextprotocol\/server["']/);
  });

  it("externalizes React and both JSX runtimes", () => {
    expect(externalsBlock).toMatch(/["']react["']/);
    expect(externalsBlock).toMatch(/["']react\/jsx-runtime["']/);
    expect(externalsBlock).toMatch(/["']react\/jsx-dev-runtime["']/);
  });

  it("externalizes React DOM and its server renderer", () => {
    expect(externalsBlock).toMatch(/["']react-dom["']/);
    expect(externalsBlock).toMatch(/["']react-dom\/server["']/);
  });

  it("builds a broker-only runtime beside the full Brain bundle", () => {
    expect(buildScript).toContain('name: "git-broker"');
    expect(buildScript).toContain('"src", "git-broker-entrypoint.ts"');
    expect(buildScript).toContain("brokerBuild");
  });

  const libraryBuilds = buildScript.slice(
    buildScript.indexOf("async function bundleLibraries"),
  );

  it("builds server library entries together with shared chunks", () => {
    const serverBuild =
      libraryBuilds.match(
        /const result = await Bun\.build\(\{([\s\S]*?)\n {2}\}\);/,
      )?.[1] ?? "";
    expect(serverBuild.replace(/\s+/g, " ")).toContain(
      'entrypoints: libraryEntries .filter((entry) => entry.name !== "chat") .map((entry) => entry.source)',
    );
    expect(serverBuild).toContain('target: "bun"');
    expect(serverBuild).toContain("splitting: true");
    expect(serverBuild).toContain('chunk: "chunks/[name]-[hash].js"');
  });

  it("isolates Chat in an unsplit browser bundle", () => {
    const browserBuild =
      libraryBuilds.match(
        /const browserResult = await Bun\.build\(\{([\s\S]*?)\n {2}\}\);/,
      )?.[1] ?? "";
    expect(browserBuild.replace(/\s+/g, " ")).toContain(
      'entrypoints: libraryEntries .filter((entry) => entry.name === "chat") .map((entry) => entry.source)',
    );
    expect(browserBuild).toContain('target: "browser"');
    expect(browserBuild).toContain("splitting: false");
    expect(browserBuild).toContain("external: sharedExternals");
  });
});
