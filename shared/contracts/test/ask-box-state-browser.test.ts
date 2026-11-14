import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Web Chat's shared ask-box record is declared in the contracts, which
 * browser apps (Studio, the dashboard) import for other names. A bundle that
 * does not use the record drops it, so it carries no package's record name.
 */
test("a browser bundle importing other contracts drops the ask-box record", async () => {
  const dir = await mkdtemp(join(tmpdir(), "contracts-browser-"));
  try {
    const entry = join(dir, "entry.ts");
    const contracts = new URL("../src/index.ts", import.meta.url).pathname;
    await writeFile(
      entry,
      `import { answeredBy } from ${JSON.stringify(contracts)};\nexport { answeredBy };\n`,
    );
    const result = await Bun.build({
      entrypoints: [entry],
      target: "browser",
      format: "esm",
      minify: true,
      throw: false,
    });
    expect(result.logs.filter((log) => log.level === "error")).toEqual([]);
    const bundle = await result.outputs[0]?.text();
    expect(bundle).toBeDefined();
    expect(bundle).not.toContain("@brains/web-chat:ask-box");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
