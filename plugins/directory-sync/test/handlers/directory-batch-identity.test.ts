import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMockEntityService } from "@brains/entity-service/test";
import { createMockServicePluginContext } from "@brains/plugins/test";
import {
  createMockProgressReporter,
  createSilentLogger,
} from "@brains/test-utils";
import { DirectorySync } from "../../src/lib/directory-sync";
import { DirectoryImportJobHandler } from "../../src/handlers/directoryImportJobHandler";
import { DirectoryCleanupJobHandler } from "../../src/handlers/directoryCleanupJobHandler";

// Exercise the real DirectorySync behind the handlers: a mocked DirectorySync
// hides the second runBulkMutation boundary that caused production imports to fail.
describe("directory job projection-batch identity", () => {
  let path: string;
  beforeEach(() => {
    path = mkdtempSync(join(tmpdir(), "directory-batch-"));
  });
  afterEach(() => {
    rmSync(path, { recursive: true, force: true });
  });

  function setup(): {
    sync: DirectorySync;
    identities: Array<{ source: string; operationId: string }>;
    context: ReturnType<typeof createMockServicePluginContext>;
    logger: ReturnType<typeof createSilentLogger>;
  } {
    const service = createMockEntityService({ entityTypes: ["note"] });
    const identities: Array<{ source: string; operationId: string }> = [];
    let active: { source: string; operationId: string } | undefined;
    service.runDurableBulkMutationChild = async <TResult>(
      input: Parameters<typeof service.runDurableBulkMutationChild>[0],
      mutation: () => Promise<TResult>,
    ): Promise<TResult> => {
      active = input;
      try {
        return await mutation();
      } finally {
        active = undefined;
      }
    };
    service.runBulkMutation = async <TResult>(
      input: Parameters<typeof service.runBulkMutation>[0],
      mutation: () => Promise<TResult>,
    ): Promise<TResult> => {
      identities.push(input);
      if (
        active &&
        (input.source !== active.source ||
          input.operationId !== active.operationId)
      ) {
        throw new Error(
          `Projection batch "${input.operationId}" cannot join active batch "${active.operationId}"`,
        );
      }
      return mutation();
    };
    const logger = createSilentLogger("batch-identity");
    const sync = new DirectorySync({
      syncPath: path,
      entityService: service,
      logger,
    });
    const context = createMockServicePluginContext({ entityService: service });
    return { sync, identities, context, logger };
  }

  const projectionBatch = {
    operationId: "root-sync",
    rootJobId: "root-sync",
    childKey: "0:directory-import",
    expectedChildren: 2,
  };

  it("imports notes under the durable job's identity rather than opening a different batch", async () => {
    const { sync, context, logger, identities } = setup();
    writeFileSync(
      join(path, "plan.md"),
      "---\nvisibility: shared\n---\n# Team plan\n",
    );
    const handler = new DirectoryImportJobHandler(logger, context, sync);
    const result = await handler.process(
      { paths: ["plan.md"], projectionBatch },
      "import-job",
      createMockProgressReporter(),
    );
    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);
    expect(identities).toEqual([
      { source: "directory-sync", operationId: "root-sync" },
    ]);
  });

  it("runs orphan cleanup under the same durable root", async () => {
    const { sync, context, logger, identities } = setup();
    const handler = new DirectoryCleanupJobHandler(logger, context, sync);
    await handler.process(
      {
        projectionBatch: {
          ...projectionBatch,
          childKey: "1:directory-cleanup",
        },
      },
      "cleanup-job",
      createMockProgressReporter(),
    );
    expect(identities).toEqual([
      { source: "directory-sync", operationId: "root-sync" },
    ]);
  });

  it("still creates independent callback batches for standalone operations", async () => {
    const { sync, context, logger, identities } = setup();
    const reporter = createMockProgressReporter();
    await new DirectoryImportJobHandler(logger, context, sync).process(
      {},
      "standalone-import",
      reporter,
    );
    await new DirectoryCleanupJobHandler(logger, context, sync).process(
      {},
      "standalone-cleanup",
      reporter,
    );
    expect(identities).toEqual([
      {
        source: "directory-sync",
        operationId: expect.stringMatching(/^import:/),
      },
      {
        source: "directory-sync",
        operationId: expect.stringMatching(/^cleanup:/),
      },
    ]);
  });
});
