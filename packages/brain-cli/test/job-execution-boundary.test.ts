import { afterEach, describe, expect, it } from "bun:test";
import defaultSite from "@brains/site-default";
import {
  App,
  parseInstanceOverrides,
  registerPackage,
  resolve,
} from "@brains/app";
import { PROJECTION_RULE_JOB_TYPE } from "@brains/core";
import defaultTheme from "@rizom/theme-default";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalBrain } from "../src/model/canonical-brain";

registerPackage("@brains/site-default", defaultSite);
registerPackage("@rizom/theme-default", defaultTheme);

const fullPresetYaml = `brain: brain
anchor: person
kind: professional
bundles: [core, media, automation, web, chat, site, publishing, federation, team]
site:
  package: "@brains/site-default"
  theme: "@rizom/theme-default"
plugins:
  directory-sync:
    autoSync: false
    initialSync: false
    seedContent: false
`;

function createFullPresetApp(dataDir: string): App {
  const config = resolve(
    canonicalBrain,
    { AI_API_KEY: "test-key" },
    parseInstanceOverrides(fullPresetYaml),
  );
  return App.create({
    ...config,
    shellConfig: {
      ...config.shellConfig,
      database: { url: `file:${dataDir}/entities.db` },
      jobQueueDatabase: { url: `file:${dataDir}/jobs.db` },
      conversationDatabase: { url: `file:${dataDir}/conversations.db` },
      runtimeStateDatabase: { url: `file:${dataDir}/runtime-state.db` },
      embeddingDatabase: { url: `file:${dataDir}/embeddings.db` },
      embedding: { enabled: true },
      dataDir: `${dataDir}/content`,
      logging: { level: "error" },
    },
  });
}

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
    const webRegistrations = webQueue.getExecutionRegistrations();
    const workerRegistrations = workerQueue.getExecutionRegistrations();
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
  });
});
