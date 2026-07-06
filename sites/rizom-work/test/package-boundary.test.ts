import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";

const packageDir = join(import.meta.dir, "..");
const basePackageDir = join(packageDir, "../rizom");

async function run(command: string[], cwd: string): Promise<string> {
  const process = Bun.spawn(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(
      [
        `Command failed: ${command.join(" ")}`,
        `cwd: ${cwd}`,
        stdout,
        stderr,
      ].join("\n"),
    );
  }

  return stdout;
}

async function findPackedTarball(
  packDir: string,
  packagePrefix: string,
): Promise<string> {
  const entries = await readdir(packDir);
  const tarball = entries.find(
    (entry) => entry.startsWith(packagePrefix) && entry.endsWith(".tgz"),
  );

  if (!tarball) {
    throw new Error(`Missing packed tarball with prefix ${packagePrefix}`);
  }

  return join(packDir, tarball);
}

describe("@brains/site-rizom-work package boundary", () => {
  test("source-published TSX imports cleanly from a packed install", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "site-rizom-work-pack-"));

    try {
      await run(
        ["bun", "pm", "pack", "--destination", tempDir, "--quiet"],
        basePackageDir,
      );
      await run(
        ["bun", "pm", "pack", "--destination", tempDir, "--quiet"],
        packageDir,
      );

      const baseTarball = await findPackedTarball(
        tempDir,
        "brains-site-rizom-",
      );
      const workTarball = await findPackedTarball(
        tempDir,
        "brains-site-rizom-work-",
      );

      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify(
          {
            type: "module",
            dependencies: {
              "@brains/site-rizom-work": `file:${workTarball}`,
            },
            overrides: {
              "@brains/site-rizom": `file:${baseTarball}`,
            },
          },
          null,
          2,
        ),
      );

      await run(["bun", "install"], tempDir);

      const output = await run(
        [
          "bun",
          "-e",
          'const site = await import("@brains/site-rizom-work"); console.log(site.default.routes[0].id)',
        ],
        tempDir,
      );

      expect(output.trim()).toBe("home");

      const packedPackageJson = await readFile(
        join(tempDir, "node_modules/@brains/site-rizom-work/package.json"),
        "utf8",
      );
      expect(packedPackageJson).not.toContain("workspace:*");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 20_000);
});
