import { describe, expect, it, mock } from "bun:test";
import {
  createEntityBulkCoordination,
  durableBulkMutationChildRefSchema,
} from "../src/entity-bulk-coordination";

function createBackend(): {
  prepareDurableBulkMutation: ReturnType<typeof mock>;
  finalizeDurableBulkMutationEnqueue: ReturnType<typeof mock>;
  failDurableBulkMutationEnqueue: ReturnType<typeof mock>;
  runDurableBulkMutationChild: ReturnType<typeof mock>;
  settleDurableBulkMutationChild: ReturnType<typeof mock>;
} {
  return {
    prepareDurableBulkMutation: mock(async () => {}),
    finalizeDurableBulkMutationEnqueue: mock(async () => {}),
    failDurableBulkMutationEnqueue: mock(async () => {}),
    runDurableBulkMutationChild: mock(
      async <TResult>(
        _input: unknown,
        mutation: () => Promise<TResult>,
      ): Promise<TResult> => mutation(),
    ),
    settleDurableBulkMutationChild: mock(async () => true),
  };
}

describe("createEntityBulkCoordination", () => {
  it("prepares the durable root at begin with the bound source and rootJobId as operationId", async () => {
    const backend = createBackend();
    const coordination = createEntityBulkCoordination(
      backend,
      "directory-sync",
    );

    await coordination.beginDurableBulkMutation({
      rootJobId: "root-1",
      expectedChildren: 3,
    });

    expect(backend.prepareDurableBulkMutation).toHaveBeenCalledWith({
      source: "directory-sync",
      operationId: "root-1",
      rootJobId: "root-1",
      expectedChildren: 3,
    });
  });

  it("mints self-contained child refs that carry no operationId or source", async () => {
    const backend = createBackend();
    const coordination = createEntityBulkCoordination(
      backend,
      "directory-sync",
    );

    const batch = await coordination.beginDurableBulkMutation({
      rootJobId: "root-1",
      expectedChildren: 2,
    });

    expect(batch.childRef("0:import")).toEqual({
      rootJobId: "root-1",
      childKey: "0:import",
      expectedChildren: 2,
    });
  });

  it("seals and aborts against the root's enqueue markers", async () => {
    const backend = createBackend();
    const coordination = createEntityBulkCoordination(
      backend,
      "directory-sync",
    );

    const batch = await coordination.beginDurableBulkMutation({
      rootJobId: "root-1",
      expectedChildren: 2,
    });
    await batch.seal();
    await batch.abort();

    expect(backend.finalizeDurableBulkMutationEnqueue).toHaveBeenCalledWith(
      "root-1",
    );
    expect(backend.failDurableBulkMutationEnqueue).toHaveBeenCalledWith(
      "root-1",
    );
  });

  it("runs a child from its ref, rehydrating source and operationId", async () => {
    const backend = createBackend();
    const coordination = createEntityBulkCoordination(
      backend,
      "directory-sync",
    );

    const result = await coordination.runDurableBulkMutationChild(
      { rootJobId: "root-1", childKey: "0:import", expectedChildren: 2 },
      "job-9",
      async () => "done",
    );

    expect(result).toBe("done");
    expect(backend.runDurableBulkMutationChild).toHaveBeenCalledWith(
      {
        source: "directory-sync",
        operationId: "root-1",
        rootJobId: "root-1",
        childKey: "0:import",
        expectedChildren: 2,
        jobId: "job-9",
      },
      expect.any(Function),
    );
  });

  it("settles a child from its ref and the job's terminal outcome", async () => {
    const backend = createBackend();
    const coordination = createEntityBulkCoordination(
      backend,
      "directory-sync",
    );

    await coordination.settleDurableBulkMutationChild(
      { rootJobId: "root-1", childKey: "0:import", expectedChildren: 2 },
      "job-9",
      "failed",
    );

    expect(backend.settleDurableBulkMutationChild).toHaveBeenCalledWith({
      operationId: "root-1",
      childKey: "0:import",
      jobId: "job-9",
      outcome: "failed",
    });
  });

  it("parses child ref tokens from job data with the exported schema", () => {
    expect(
      durableBulkMutationChildRefSchema.parse({
        rootJobId: "root-1",
        childKey: "0:import",
        expectedChildren: 2,
      }),
    ).toEqual({
      rootJobId: "root-1",
      childKey: "0:import",
      expectedChildren: 2,
    });
    expect(
      durableBulkMutationChildRefSchema.safeParse({
        rootJobId: "root-1",
        childKey: "0:import",
      }).success,
    ).toBe(false);
    expect(
      durableBulkMutationChildRefSchema.safeParse({
        rootJobId: "",
        childKey: "0:import",
        expectedChildren: 2,
      }).success,
    ).toBe(false);
  });
});
