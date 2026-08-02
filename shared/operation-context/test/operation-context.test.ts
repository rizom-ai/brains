import { describe, expect, it } from "bun:test";
import { OperationContext } from "../src";
import type { OperationProvenance } from "@brains/contracts";

const root: OperationProvenance = {
  rootJobId: "root-1",
  causationId: "job-1",
  projectionLineage: [],
  derivationDepth: 0,
};

describe("OperationContext", () => {
  it("scopes provenance across asynchronous work and restores its parent", async () => {
    const context = OperationContext.createFresh();
    const child: OperationProvenance = {
      rootJobId: "root-1",
      causationId: "message-2",
      projectionId: "topics-projection",
      projectionLineage: ["topics-projection"],
      derivationDepth: 1,
    };

    await context.run(root, "job-1", async () => {
      expect(context.current()).toEqual({
        provenance: root,
        operationId: "job-1",
      });
      await context.run(child, "message-2", async () => {
        await Promise.resolve();
        expect(context.current()).toEqual({
          provenance: child,
          operationId: "message-2",
        });
      });
      expect(context.current()).toEqual({
        provenance: root,
        operationId: "job-1",
      });
    });

    expect(context.current()).toBeUndefined();
  });

  it("isolates concurrent causal lineages", async () => {
    const context = OperationContext.createFresh();
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstEntered!: () => void;
    const entered = new Promise<void>((resolve) => {
      firstEntered = resolve;
    });

    const first = context.run(root, "job-1", async () => {
      firstEntered();
      await firstBlocked;
      return context.current()?.provenance.rootJobId;
    });
    await entered;
    const second = context.run(
      { ...root, rootJobId: "root-2", causationId: "job-2" },
      "job-2",
      async () => context.current()?.provenance.rootJobId,
    );
    releaseFirst();

    expect(await Promise.all([first, second])).toEqual(["root-1", "root-2"]);
  });
});
