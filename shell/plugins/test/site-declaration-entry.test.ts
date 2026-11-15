import { expect, test } from "bun:test";

/**
 * A published site bundles its declarations through this entry, so the
 * entry carries no runtime: no database client, no entity service.
 */
test("the site declaration entry bundles without the runtime", async () => {
  // Bundled in a child process: the bundler sees the sources as a site's
  // build does, not through the test runner's module graph.
  const build = Bun.spawn(
    [
      process.execPath,
      "build",
      new URL("../src/site/site-declaration-entry.ts", import.meta.url)
        .pathname,
      "--target=node",
      "--format=esm",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [bundle, errors, exitCode] = await Promise.all([
    new Response(build.stdout).text(),
    new Response(build.stderr).text(),
    build.exited,
  ]);
  expect({ exitCode, errors }).toEqual({ exitCode: 0, errors: "" });
  expect(bundle.length).toBeGreaterThan(0);
  expect(bundle).not.toContain("@libsql");
  expect(bundle).not.toContain("drizzle-orm");
});

test("the site declaration entry carries what a site's templates are built with", async () => {
  const entry = await import("../src/site/site-declaration-entry");
  expect(Object.keys(entry).sort()).toEqual([
    "createTemplate",
    "defineDataSource",
    "findRouteByRole",
    "renderedLinkFields",
    "siteDataSourceRuntime",
    "withSiteRuntime",
  ]);
});
