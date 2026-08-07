import { describe, expect, test } from "bun:test";
import { cp, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const brainPackageDirectory = join(import.meta.dir, "..");
const pluginFixtureDirectory = join(
  import.meta.dir,
  "fixtures",
  "external-route-plugin",
);
const consumerFixtureDirectory = join(
  import.meta.dir,
  "fixtures",
  "packed-external-route-consumer",
);

async function run(command: string[], cwd: string): Promise<string> {
  const child = Bun.spawn(command, {
    cwd,
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

async function findTarball(directory: string, prefix: string): Promise<string> {
  const name = (await readdir(directory)).find(
    (entry) => entry.startsWith(prefix) && entry.endsWith(".tgz"),
  );
  if (!name)
    throw new Error(`Packed tarball with prefix "${prefix}" is missing`);
  return join(directory, name);
}

async function reservePort(): Promise<number> {
  const server = Bun.serve({
    port: 0,
    fetch: () => new Response("reserved"),
  });
  const port = server.port;
  await server.stop(true);
  if (port === undefined) throw new Error("Bun did not allocate a test port");
  return port;
}

function startPackedBrain(cwd: string): Bun.ReadableSubprocess {
  return Bun.spawn(["bun", "run", "brain", "start"], {
    cwd,
    env: {
      ...process.env,
      AI_API_KEY: "packed-http-route-check",
      NO_COLOR: "1",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
}

type PackedBrainProcess = Bun.ReadableSubprocess;

async function stopProcess(child: PackedBrainProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  const stopped = await Promise.race([
    child.exited.then(() => true),
    Bun.sleep(10_000).then(() => false),
  ]);
  if (!stopped) {
    child.kill("SIGKILL");
    await child.exited;
  }
}

async function fetchExternalRoute(
  url: string,
  child: PackedBrainProcess,
): Promise<Response> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Packed Brain exited before serving ${url}`);
    }
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.status === 200) return response;
    } catch {
      // The listener is not ready yet.
    }
    await Bun.sleep(100);
  }
  throw new Error(`Timed out waiting for packed external route ${url}`);
}

describe("packed external handler route", () => {
  test("installs and serves through documented @rizom/brain entry points", async () => {
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "packed-external-route-"),
    );
    let child: PackedBrainProcess | undefined;
    let stdout: Promise<string> | undefined;
    let stderr: Promise<string> | undefined;

    try {
      await run(
        ["bun", "pm", "pack", "--destination", temporaryDirectory, "--quiet"],
        brainPackageDirectory,
      );
      const brainTarball = await findTarball(
        temporaryDirectory,
        "rizom-brain-",
      );

      const pluginDirectory = join(temporaryDirectory, "external-route-plugin");
      await cp(pluginFixtureDirectory, pluginDirectory, { recursive: true });
      const pluginManifestPath = join(pluginDirectory, "package.json");
      const pluginManifest = await Bun.file(pluginManifestPath).json();
      pluginManifest.devDependencies["@rizom/brain"] = `file:${brainTarball}`;
      await writeFile(
        pluginManifestPath,
        `${JSON.stringify(pluginManifest, null, 2)}\n`,
      );
      await run(["bun", "install", "--ignore-scripts"], pluginDirectory);
      await run(["bun", "run", "build"], pluginDirectory);
      await run(
        ["bun", "pm", "pack", "--destination", temporaryDirectory, "--quiet"],
        pluginDirectory,
      );
      const pluginTarball = await findTarball(
        temporaryDirectory,
        "rizom-brain-plugin-http-route-fixture-",
      );

      const consumerDirectory = join(temporaryDirectory, "consumer");
      await cp(consumerFixtureDirectory, consumerDirectory, {
        recursive: true,
      });
      const consumerManifestPath = join(consumerDirectory, "package.json");
      const consumerManifest = await Bun.file(consumerManifestPath).text();
      await writeFile(
        consumerManifestPath,
        consumerManifest
          .replace("__RIZOM_BRAIN_TARBALL__", brainTarball)
          .replace("__EXTERNAL_ROUTE_TARBALL__", pluginTarball),
      );
      const productionPort = await reservePort();
      const brainYamlPath = join(consumerDirectory, "brain.yaml");
      await writeFile(
        brainYamlPath,
        (await Bun.file(brainYamlPath).text()).replace(
          "__PRODUCTION_PORT__",
          String(productionPort),
        ),
      );
      await run(["bun", "install", "--ignore-scripts"], consumerDirectory);

      child = startPackedBrain(consumerDirectory);
      stdout = new Response(child.stdout).text();
      stderr = new Response(child.stderr).text();

      const response = await fetchExternalRoute(
        `http://127.0.0.1:${productionPort}/external-route`,
        child,
      );
      expect(await response.json()).toEqual({
        source: "packed-external-interface",
        path: "/external-route",
      });
    } catch (error) {
      if (child) await stopProcess(child);
      const logs = [await stdout, await stderr].filter(Boolean).join("\n");
      throw new Error(`${String(error)}\n${logs}`, { cause: error });
    } finally {
      if (child) await stopProcess(child);
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }, 180_000);
});
