import { expect, test } from "bun:test";

// Keep DOM globals and the documented StyleX JIT workaround in this child,
// rather than changing the CLI suite or the production runtime environment.
test("Studio grouping integration with real entity adapters", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      "--preload",
      "@brains/build-tools/stylex-test-preload",
      "--preload",
      "@brains/studio/test/preload",
      "./test/studio-groupings/studio-groupings-plugin.test.tsx",
      "./test/studio-groupings/studio-groupings-runtime.test.ts",
      "./test/studio-groupings/studio-groupings-processes.test.ts",
    ],
    {
      cwd: new URL("..", import.meta.url).pathname,
      // Bun omits per-file headers under an agent (CLAUDECODE), and the
      // assertions below read them.
      env: { ...process.env, CLAUDECODE: "", BUN_JSC_useDFGJIT: "0" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
    expect(stderr).toMatch(/\b[1-9]\d* pass\b/);
    for (const suite of [
      "plugin.test.tsx",
      "runtime.test.ts",
      "processes.test.ts",
    ]) {
      expect(stderr).toContain(`studio-groupings-${suite}:`);
    }
  } finally {
    if (child.exitCode === null) child.kill();
  }
}, 120_000);
