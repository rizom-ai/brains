import { afterEach, describe, expect, it } from "bun:test";
import { parseInstanceOverrides, resolve, type App } from "@brains/app";
import { canonicalBrain } from "../src/model/canonical-brain";
import { PROJECTION_RULE_JOB_TYPE } from "@brains/core";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFullPresetApp, fullPresetYaml } from "./helpers/full-preset-app";

describe("canonical durable job execution boundary", () => {
  const apps: App[] = [];
  const directories: string[] = [];

  afterEach(async () => {
    for (const app of apps.splice(0).reverse()) await app.stop();
    for (const directory of directories.splice(0).reverse()) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("derives the exact worker inventory from immutable full-preset registrations", async () => {
    const webDirectory = await mkdtemp(join(tmpdir(), "brain-web-audit-"));
    const workerDirectory = await mkdtemp(
      join(tmpdir(), "brain-worker-audit-"),
    );
    directories.push(webDirectory, workerDirectory);

    const webApp = createFullPresetApp(webDirectory);
    apps.push(webApp);
    await webApp.migrate();
    await webApp.initialize(
      { mode: "register-only" },
      { migrationsCompleted: true, processRole: "web" },
    );

    const workerApp = createFullPresetApp(workerDirectory);
    apps.push(workerApp);
    await workerApp.migrate();
    await workerApp.initialize(undefined, {
      migrationsCompleted: true,
      processRole: "worker",
    });

    const webQueue = webApp.getShell().getJobQueueService();
    const workerShell = workerApp.getShell();
    const workerQueue = workerShell.getJobQueueService();
    const webRegistrations = webQueue.getExecutionRegistrations() ?? [];
    const workerRegistrations = workerQueue.getExecutionRegistrations() ?? [];
    expect(workerRegistrations.length).toBeGreaterThan(0);
    const webTypes = webRegistrations.map(({ type }) => type).sort();
    const workerTypes = workerRegistrations.map(({ type }) => type).sort();

    expect(workerTypes).toEqual([...webTypes, PROJECTION_RULE_JOB_TYPE].sort());
    expect(Object.isFrozen(workerRegistrations)).toBe(true);
    expect(workerRegistrations.every(Object.isFrozen)).toBe(true);
    expect(
      workerRegistrations.every(
        ({ type }) => workerQueue.getHandler(type) !== undefined,
      ),
    ).toBe(true);
    expect(workerShell.getMCPService().listTools()).toEqual([]);
    expect((await workerShell.getAppInfo()).daemons).toEqual([]);

    const configuredInterfaces = new Set(
      (
        resolve(
          canonicalBrain,
          { AI_API_KEY: "test-key" },
          parseInstanceOverrides(fullPresetYaml),
        ).plugins ?? []
      )
        .filter((plugin) => plugin.type === "interface")
        .map((plugin) => plugin.id),
    );
    expect(
      workerShell
        .getPluginManager()
        .getAllPluginIds()
        .filter((pluginId) => configuredInterfaces.has(pluginId)),
    ).toEqual([]);
    // Two full-preset boots do not fit bun's 5s default on a two-CPU runner.
  }, 30_000);

  // Contact alerts and other background jobs send from the worker, which
  // runs no interfaces: it still needs every channel's sender.
  it("gives the worker every channel and sender the web process has", async () => {
    const presetYaml = `${fullPresetYaml}  email:
    apiKey: re_test
    from: Brain <brain@example.com>
`;
    const webDirectory = await mkdtemp(join(tmpdir(), "brain-web-channels-"));
    const workerDirectory = await mkdtemp(
      join(tmpdir(), "brain-worker-channels-"),
    );
    directories.push(webDirectory, workerDirectory);

    const webApp = createFullPresetApp(webDirectory, presetYaml);
    apps.push(webApp);
    await webApp.migrate();
    await webApp.initialize(
      { mode: "register-only" },
      { migrationsCompleted: true, processRole: "web" },
    );
    const workerApp = createFullPresetApp(workerDirectory, presetYaml);
    apps.push(workerApp);
    await workerApp.migrate();
    await workerApp.initialize(undefined, {
      migrationsCompleted: true,
      processRole: "worker",
    });

    const web = webApp.getShell().getChannelRegistry();
    const worker = workerApp.getShell().getChannelRegistry();
    const types = web.listDescriptors().map(({ type }) => type);
    expect(types).toContain("email");
    expect(worker.listDescriptors().map(({ type }) => type)).toEqual(types);
    const senders = async (
      registry: typeof web,
    ): Promise<Array<[string, boolean]>> =>
      Promise.all(
        types.flatMap((type) => {
          const provider = registry.getDeliveryProvider(type);
          return provider
            ? [
                provider
                  .isAvailable()
                  .then((available): [string, boolean] => [type, available]),
              ]
            : [];
        }),
      );
    expect(await senders(worker)).toEqual(await senders(web));
    expect(await senders(worker)).toContainEqual(["email", true]);
  }, 30_000);
});
