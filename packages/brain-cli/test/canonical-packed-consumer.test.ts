import { describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const packageDirectory = join(import.meta.dir, "..");
const fixtureDirectory = join(
  import.meta.dir,
  "fixtures",
  "canonical-packed-consumer",
);

async function run(
  command: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const child = Bun.spawn(command, {
    cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(
      [`Command failed: ${command.join(" ")}`, stdout, stderr].join("\n"),
    );
  }
  return `${stdout}\n${stderr}`;
}

describe("canonical packed consumer", () => {
  test("installs, imports, and completes a startup check outside the monorepo", async () => {
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "canonical-brain-pack-"),
    );
    try {
      await run(
        ["bun", "pm", "pack", "--destination", temporaryDirectory, "--quiet"],
        packageDirectory,
      );
      const tarballName = (await readdir(temporaryDirectory)).find(
        (entry) => entry.startsWith("rizom-brain-") && entry.endsWith(".tgz"),
      );
      if (!tarballName)
        throw new Error("Packed @rizom/brain tarball is missing");

      const consumerDirectory = join(temporaryDirectory, "consumer");
      await cp(fixtureDirectory, consumerDirectory, { recursive: true });
      const manifest = await Bun.file(
        join(consumerDirectory, "package.json"),
      ).text();
      await writeFile(
        join(consumerDirectory, "package.json"),
        manifest.replace(
          "__RIZOM_BRAIN_TARBALL__",
          join(temporaryDirectory, tarballName),
        ),
      );
      await mkdir(join(consumerDirectory, "seed-content"));
      await writeFile(
        join(consumerDirectory, "seed-content", "README.md"),
        "# Packed consumer\n",
      );

      await run(["bun", "install", "--ignore-scripts"], consumerDirectory);
      await run(["bun", "run", "import-smoke.ts"], consumerDirectory);
      const startupOutput = await run(
        ["bun", "run", "brain", "start", "--startup-check"],
        consumerDirectory,
        {
          ...process.env,
          AI_API_KEY: "packed-startup-check",
          GIT_SYNC_TOKEN: "packed-startup-check",
        },
      );

      expect(startupOutput).toContain("Dashboard plugin registered");
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }, 120_000);
});
