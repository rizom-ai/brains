import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";

const observationSchema = z.object({
  body: z.string(),
  cwd: z.string(),
  invocation: z.string(),
});

test("the canonical minimal launcher preserves stdio and the instance directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "posture-stdin-"));
  const cli = join(root, "packages/brain-cli");
  const instance = join(cli, "test-apps/minimal");
  try {
    await mkdir(instance, { recursive: true });
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ private: true, workspaces: ["packages/brain-cli"] }),
    );
    await writeFile(
      join(cli, "package.json"),
      JSON.stringify({
        name: "@rizom/brain",
        version: "0.0.0",
        scripts: {
          "build:ui": "bun -e 'void 0'",
          "dev:start": "bun stdin-probe.ts",
          "start:minimal": packageJson.scripts["start:minimal"],
        },
      }),
    );
    await writeFile(
      join(cli, "stdin-probe.ts"),
      `console.log(JSON.stringify({
        body: await Bun.stdin.text(),
        cwd: process.cwd(),
        invocation: process.env.INIT_CWD,
      }));`,
    );
    const child = Bun.spawn([process.execPath, "start:minimal"], {
      cwd: cli,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = new Response(child.stdout).text();
    const stderr = new Response(child.stderr).text();
    try {
      await child.stdin.write("canonical-stdio-probe\n");
      await child.stdin.end();
      const [code, output, diagnostics] = await Promise.all([
        child.exited,
        stdout,
        stderr,
      ]);
      expect({ code, diagnostics: code === 0 ? "" : diagnostics }).toEqual({
        code: 0,
        diagnostics: "",
      });
      const line = output
        .split("\n")
        .find((entry) => entry.includes('{"body"'));
      expect(line).toBeDefined();
      const observation = observationSchema.parse(
        JSON.parse(line?.slice(line.indexOf("{")) ?? "null"),
      );
      expect(observation).toEqual({
        body: "canonical-stdio-probe\n",
        cwd: cli,
        invocation: instance,
      });
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      await Promise.all([child.exited, stdout, stderr]);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
