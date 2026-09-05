import { createTestEntity } from "@brains/entity-service/test";
import { describe, expect, it, mock } from "bun:test";
import {
  drainDurableEntityExports,
  type DurableEntityExportDeps,
} from "../src/lib/durable-entity-export";

const intent = {
  entityType: "note",
  entityId: "durable-note",
  operation: "upsert" as const,
  revision: "revision-1",
  markedAt: 10,
};

function createDeps(options?: { pushFails?: boolean }): {
  order: string[];
  deps: DurableEntityExportDeps<string>;
} {
  const order: string[] = [];
  const entity = createTestEntity("note", {
    id: intent.entityId,
    content: "Durable content",
  });
  const acknowledgeEntityExports = mock(async () => {
    order.push("ack");
    return 1;
  });

  const deps: DurableEntityExportDeps<string> = {
    listPendingEntityExports: async () => [intent],
    getEntity: async () => entity,
    writeEntity: async () => {
      order.push("write");
    },
    deleteEntityFile: async () => {
      order.push("delete");
    },
    isPendingRemoteDelete: () => false,
    commitAndPush: async () => {
      order.push("push");
      if (options?.pushFails) throw new Error("push failed");
      return { pushed: true, checkpoint: "confirmed-checkpoint" };
    },
    saveCheckpoint: async (checkpoint: string) => {
      expect(checkpoint).toBe("confirmed-checkpoint");
      order.push("checkpoint");
    },
    acknowledgeEntityExports,
  };
  return { order, deps };
}

async function captureFailure(
  operation: () => Promise<unknown>,
): Promise<unknown> {
  try {
    await operation();
    return undefined;
  } catch (error) {
    return error;
  }
}

describe("durable entity export draining", () => {
  it("acknowledges an entity mutation only after its file is pushed", async () => {
    const { deps, order } = createDeps();

    const result = await drainDurableEntityExports(deps);

    expect(result).toEqual({ processed: 1, acknowledged: 1, pushed: true });
    expect(order).toEqual(["write", "push", "checkpoint", "ack"]);
  });

  it("identifies an upsert intent whose durable entity is missing", async () => {
    const { deps, order } = createDeps();
    deps.getEntity = async (): Promise<null> => null;

    const failure = await captureFailure(() => drainDurableEntityExports(deps));

    expect(failure).toEqual(
      expect.objectContaining({
        message: expect.stringContaining("note:durable-note"),
      }),
    );
    expect(order).not.toContain("ack");
  });

  it("retains the durable intent when Git cannot confirm a checkpoint", async () => {
    const { deps, order } = createDeps();
    deps.commitAndPush = async (): Promise<{
      pushed: boolean;
      checkpoint: string | null;
    }> => {
      order.push("push");
      return { pushed: false, checkpoint: null };
    };

    const failure = await captureFailure(() => drainDurableEntityExports(deps));

    expect(failure).toEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          "did not return a confirmed checkpoint",
        ),
      }),
    );
    expect(order).toEqual(["write", "push"]);
  });

  it("retains the durable intent when Git push fails", async () => {
    const { deps, order } = createDeps({ pushFails: true });

    const failure = await captureFailure(() => drainDurableEntityExports(deps));

    expect(failure).toEqual(
      expect.objectContaining({ message: "push failed" }),
    );
    expect(order).toEqual(["write", "push"]);
  });
});
