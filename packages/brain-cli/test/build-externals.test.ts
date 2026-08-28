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

  it("builds public library entries together with shared chunks", () => {
    expect(buildScript).toContain(
      "entrypoints: libraryEntries.map((entry) => entry.source)",
    );
    expect(buildScript).toContain("splitting: true");
    expect(buildScript).toContain('chunk: "chunks/[name]-[hash].js"');
  });
});
