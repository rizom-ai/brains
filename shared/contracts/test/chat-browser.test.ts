import { expect, test } from "bun:test";

/** Chat is a public browser API; server-side authoring helpers must stay out. */
test("bundles the Chat contract for browsers without markdown filesystem helpers", async () => {
  const result = await Bun.build({
    entrypoints: [new URL("../src/chat.ts", import.meta.url).pathname],
    target: "browser",
    format: "esm",
    throw: false,
  });
  expect(result.logs.filter((log) => log.level === "error")).toEqual([]);
  expect(result.success).toBe(true);
  const bundle = await result.outputs[0]?.text();
  expect(bundle).toBeDefined();
  expect(bundle).not.toContain("gray-matter");
});
