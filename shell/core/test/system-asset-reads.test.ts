import { afterEach, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { migrateConversations } from "@brains/conversation-service/migrate";
import { baseEntitySchema } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import {
  createTestEntity,
  createTestEntityAdapter,
} from "@brains/entity-service/test";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import type { ToolContext } from "@brains/mcp-service";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { isRecord } from "@brains/utils/is-record";
import { Shell } from "../src/shell";
import { createTestShellConfig } from "./helpers/test-config";

/**
 * The system tools and resources read an asset-backed record as its stored
 * reference and load its bytes only where they hand them out, so none asks
 * the entity service for the legacy data URL form.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

async function bootShell(): Promise<Shell> {
  const testDirectory = await createTestDirectory();
  cleanups.push(testDirectory.cleanup);
  const { dir } = testDirectory;
  await Promise.all([
    migrateEntities({ url: `file:${dir}/test.db` }),
    migrateJobQueue({ url: `file:${dir}/test-jobs.db` }),
    migrateConversations({ url: `file:${dir}/test-conv.db` }),
    migrateRuntimeState({ url: `file:${dir}/test-runtime-state.db` }),
  ]);
  const shell = Shell.createFresh(
    createTestShellConfig(dir),
    { logger: createSilentLogger("system-asset-reads") },
    { processRole: "web" },
  );
  shell
    .getEntityRegistry()
    .registerEntityType(
      "picture",
      baseEntitySchema,
      createTestEntityAdapter("picture"),
      {
        binaryStorage: "asset",
        embeddable: false,
        fullTextSearchable: false,
      },
    );
  await shell.initialize();
  cleanups.push(() => shell.shutdown());
  const entityService = shell.getEntityService();
  const asset = await entityService.stageAsset(BYTES);
  await entityService.createEntity({
    entity: createTestEntity("picture", {
      id: "cover",
      content: asset.ref,
      metadata: { title: "Cover", mediaType: "image/png" },
    }),
    stagedAsset: asset,
  });
  return shell;
}

const admin: ToolContext = {
  interfaceType: "mcp",
  actor: { kind: "user", userId: "admin" },
  userPermissionLevel: "admin",
};

function callTool(
  shell: Shell,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const registered = shell
    .getMCPService()
    .listTools()
    .find(({ tool }) => tool.name === name);
  if (!registered) throw new Error(`No tool ${name}`);
  return Promise.resolve(registered.tool.handler(input, admin));
}

async function readResource(shell: Shell, uri: string): Promise<unknown> {
  const server = shell.getMCPService().createMcpServer("admin");
  const client = new Client({ name: "system-asset-reads", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return (await client.readResource({ uri })).contents;
  } finally {
    await client.close();
    await server.close();
  }
}

/** What `system_status` reports of legacy reads, the soak's own signal. */
const legacyReads = async (shell: Shell): Promise<unknown[]> =>
  (await shell.getAppInfo()).legacyBinaryContent;

it("lists a type without embeddings for a search as stored", async () => {
  const shell = await bootShell();

  const result = await callTool(shell, "system_search", {
    query: "cover",
    scope: { kind: "type", entityType: "picture" },
  });

  expect(await legacyReads(shell)).toEqual([]);
  expect(JSON.stringify(result)).toContain("[binary picture data");
});

it("serves an entity resource's data URL from the asset's bytes", async () => {
  const shell = await bootShell();

  const contents = await readResource(shell, "entity://picture/cover");

  expect(await legacyReads(shell)).toEqual([]);
  expect(contents).toEqual([
    {
      uri: "entity://picture/cover",
      mimeType: "text/markdown",
      text: `data:image/png;base64,${BYTES.toString("base64")}`,
    },
  ]);
});

it("reads an update back as stored, with no bytes in the confirmation", async () => {
  const shell = await bootShell();
  const proposal = await callTool(shell, "system_update", {
    entityType: "picture",
    id: "cover",
    operation: { fields: { visibility: "shared" } },
  });
  const args = isRecord(proposal) ? proposal["args"] : undefined;
  if (!isRecord(args))
    throw new Error(`No confirmation: ${JSON.stringify(proposal)}`);

  const updated = await callTool(shell, "system_update", args);

  expect(await legacyReads(shell)).toEqual([]);
  expect(updated).toMatchObject({ success: true });
  expect(JSON.stringify(updated)).not.toContain("base64");
});

it("checks a create's id against the stored record", async () => {
  const shell = await bootShell();

  const result = await callTool(shell, "system_create", {
    entityType: "picture",
    title: "cover",
    source: { kind: "text", content: "anything" },
  });

  expect(await legacyReads(shell)).toEqual([]);
  expect(JSON.stringify(result)).toContain("already exists");
});
