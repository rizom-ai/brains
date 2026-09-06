import { afterEach, describe, expect, it, mock } from "bun:test";
import { App, parseInstanceOverrides, resolve } from "@brains/app";
import {
  atprotoService,
  type AtprotoPdsClientLike,
  type AtprotoServiceDeps,
} from "@brains/atproto";
import { AtprotoProjectionRegistry } from "@brains/atproto-contracts";
import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalBrain } from "../src/model/canonical-brain";
import packageJson from "../package.json";

const federationYaml = `brain: brain
bundleContract: capability-bundles-v1
anchor: person
kind: professional
bundles: [core, federation]
plugins:
  directory-sync:
    autoSync: false
    initialSync: false
    seedContent: false
`;

const ATPROTO_PLUGIN_ID = "@brains/atproto:atproto";

function createPdsClientMocks(): {
  deps: AtprotoServiceDeps;
  putRecord: ReturnType<typeof mock>;
} {
  const putRecord = mock(async () => ({
    uri: "at://did:plc:repo/ai.rizom.brain.card/self",
    cid: "cid",
  }));
  const client: AtprotoPdsClientLike = {
    createSession: mock(async () => ({
      did: "did:plc:repo",
      handle: "brain.example.com",
      accessJwt: "jwt",
      refreshJwt: "refresh",
    })),
    createRecord: mock(async () => ({
      uri: "at://did:plc:repo/record",
      cid: "cid",
    })),
    putRecord,
    deleteRecord: mock(async () => {}),
  };
  return { deps: { createPdsClient: () => client }, putRecord };
}

/**
 * The canonical federation composition, with the atproto service rebuilt
 * over a fake PDS client. The composition's own instance is replaced rather
 * than configured: a PDS client is a collaborator, not configuration.
 */
function createFederationApp(
  dataDir: string,
  deps: AtprotoServiceDeps,
): { app: App; atproto: Plugin } {
  const config = resolve(
    canonicalBrain,
    { AI_API_KEY: "test-key" },
    parseInstanceOverrides(federationYaml),
  );
  const metadata = { name: "@brains/atproto", version: packageJson.version };
  const definition = atprotoService(deps);
  bindPluginPackageMetadata(definition, metadata);
  const [atproto] = instantiatePluginPackageDefinition(
    definition,
    {
      identifier: "brain.example.com",
      appPassword: "secret",
      repoDid: "did:plc:repo",
    },
    metadata,
  );
  if (!atproto) throw new Error("atproto service was not created");
  const others = (config.plugins ?? []).filter(
    (plugin) => plugin.id !== ATPROTO_PLUGIN_ID,
  );
  expect(others).toHaveLength((config.plugins ?? []).length - 1);
  const app = App.create({
    ...config,
    plugins: [...others, atproto],
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
  return { app, atproto };
}

function cardWrites(putRecord: ReturnType<typeof mock>): unknown[] {
  return putRecord.mock.calls.filter(
    (call) =>
      z.looseObject({ collection: z.string().optional() }).parse(call[0])
        .collection === "ai.rizom.brain.card",
  );
}

// The unit tests in plugins/atproto arm the full-boot gate by broadcasting
// pluginsRegistered themselves. This suite proves the REAL bootloader arms
// it: a full boot of the canonical federation composition publishes the
// brain card, and a startup-check boot does not.
describe("AT Protocol boot publishing through the real bootloader", () => {
  const directories: string[] = [];

  afterEach(async () => {
    AtprotoProjectionRegistry.resetInstance();
    for (const directory of directories.splice(0).reverse()) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("publishes the brain card during a full boot", async () => {
    const directory = await mkdtemp(join(tmpdir(), "brain-atproto-boot-"));
    directories.push(directory);
    const { deps, putRecord } = createPdsClientMocks();
    const { app } = createFederationApp(directory, deps);

    await app.migrate();
    await app.initialize(undefined, { migrationsCompleted: true });
    // Boot publishing is scheduled, not awaited; shutdown drains the tasks.
    await app.stop();

    expect(cardWrites(putRecord)).toHaveLength(1);
  });

  it("does not publish during a startup-check boot", async () => {
    const directory = await mkdtemp(join(tmpdir(), "brain-atproto-check-"));
    directories.push(directory);
    const { deps, putRecord } = createPdsClientMocks();
    const { app } = createFederationApp(directory, deps);

    await app.migrate();
    await app.initialize(
      { mode: "startup-check" },
      { migrationsCompleted: true },
    );
    await app.stop();

    expect(putRecord).not.toHaveBeenCalled();
  });
});
