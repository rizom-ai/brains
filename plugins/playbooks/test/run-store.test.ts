import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import {
  PlaybookRunStore,
  createPlaybookRun,
  type PlaybookGateVerdict,
  type PlaybookRunEvidence,
} from "../src/run-store";

async function tempStorageDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "brains-playbook-run-store-"));
}

function evidence(id: string): PlaybookRunEvidence {
  return {
    id,
    kind: "entity_event",
    stateId: "seed",
    observedAt: new Date("2026-06-07T12:00:00.000Z").toISOString(),
    data: { entityType: "note", entityId: "note-1", operation: "created" },
  };
}

function verdict(): PlaybookGateVerdict {
  return {
    stateId: "seed",
    condition: "A note exists.",
    conditionHash: "condition-hash-1",
    evidenceWatermark: "2026-06-07T12:00:00.000Z",
    satisfied: true,
    source: "compiled-check",
    evidenceIds: ["evidence-1"],
    claims: [
      {
        evidenceId: "evidence-1",
        kind: "entity_event",
        data: { entityType: "note" },
      },
    ],
    evaluatedAt: new Date("2026-06-07T12:01:00.000Z").toISOString(),
  };
}

describe("PlaybookRunStore", () => {
  it("appends evidence without reverting newer scalar run state", async () => {
    const store = new PlaybookRunStore(await tempStorageDir());
    const run = createPlaybookRun({
      playbookId: "rover-onboarding",
      playbookVersion: "version-1",
      initialState: "welcome",
    });
    await store.upsert(run);
    await store.upsert({ ...run, currentState: "seed" });

    const updated = await store.appendEvidence(run.id, evidence("evidence-1"));

    expect(updated.currentState).toBe("seed");
    expect(updated.evidence).toEqual([evidence("evidence-1")]);
  });

  it("preserves existing evidence when a stale run snapshot updates state", async () => {
    const store = new PlaybookRunStore(await tempStorageDir());
    const run = createPlaybookRun({
      playbookId: "rover-onboarding",
      playbookVersion: "version-1",
      initialState: "welcome",
    });
    await store.upsert(run);
    await store.appendEvidence(run.id, evidence("evidence-1"));

    const updated = await store.upsert({ ...run, currentState: "seed" });

    expect(updated.currentState).toBe("seed");
    expect(updated.evidence).toEqual([evidence("evidence-1")]);
  });

  it("preserves existing verifier verdicts when a stale run snapshot updates state", async () => {
    const store = new PlaybookRunStore(await tempStorageDir());
    const run = createPlaybookRun({
      playbookId: "rover-onboarding",
      playbookVersion: "version-1",
      initialState: "welcome",
    });
    await store.upsert({ ...run, gateVerdicts: [verdict()] });

    const updated = await store.upsert({ ...run, currentState: "seed" });

    expect(updated.currentState).toBe("seed");
    expect(updated.gateVerdicts).toEqual([verdict()]);
  });
});
