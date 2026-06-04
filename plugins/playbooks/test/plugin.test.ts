import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "bun:test";
import { createPluginHarness, expectSuccess } from "@brains/plugins/test";
import { playbooksPlugin } from "../src";

async function tempStorageDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "brains-playbooks-"));
}

describe("PlaybooksPlugin", () => {
  it("returns lifecycle starters for active anchor web-chat playbooks", async () => {
    const harness = createPluginHarness({ dataDir: await tempStorageDir() });
    await harness.installPlugin(
      playbooksPlugin({
        storageDir: await tempStorageDir(),
        lifecycle: {
          onboarding: {
            trigger: "first-anchor-web-chat",
            playbookId: "rover-onboarding",
            once: true,
            starterText: "Set up Rover",
            description: "Learn Rover by doing real setup work.",
            starterPrompt: "Start the Rover onboarding playbook.",
          },
        },
      }),
    );
    harness.addEntities([
      {
        id: "rover-onboarding",
        entityType: "playbook",
        content: "# Rover Onboarding\n\nTeach by doing.",
        metadata: {
          title: "Rover Onboarding",
          status: "active",
          audience: "anchor",
          completionMode: "agent-confirmed",
        },
      },
    ]);

    const response = await harness.sendMessage<
      {
        lifecycle: string;
        interfaceType: string;
        userPermissionLevel: "anchor";
      },
      {
        starters: Array<{
          id: string;
          title: string;
          description?: string;
          playbookId: string;
          lifecycle: string;
          starterPrompt: string;
        }>;
      }
    >("playbooks:lifecycle-starters", {
      lifecycle: "onboarding",
      interfaceType: "web-chat",
      userPermissionLevel: "anchor",
    });

    expect(response?.starters).toHaveLength(1);
    expect(response?.starters[0]).toEqual({
      id: "onboarding",
      title: "Set up Rover",
      description: "Learn Rover by doing real setup work.",
      playbookId: "rover-onboarding",
      lifecycle: "onboarding",
      starterPrompt: "Start the Rover onboarding playbook.",
    });
  });

  it("tracks playbook run progress and completion", async () => {
    const harness = createPluginHarness({ dataDir: await tempStorageDir() });
    await harness.installPlugin(
      playbooksPlugin({ storageDir: await tempStorageDir() }),
    );

    const started = await harness.executeTool("playbook_start", {
      playbookId: "rover-onboarding",
      lifecycle: "onboarding",
      conversationId: "web-1",
    });
    expectSuccess(started);
    const startedData = started.data as {
      activeRun: { id: string; status: string };
    };
    const runId = startedData.activeRun.id;

    const progressed = await harness.executeTool("playbook_record_progress", {
      runId,
      currentPhase: "first-knowledge-seed",
      notes: { seedKind: "note" },
    });
    expectSuccess(progressed);
    const progressedData = progressed.data as {
      activeRun: { currentPhase: string; notes: Record<string, unknown> };
    };
    expect(progressedData.activeRun.currentPhase).toBe("first-knowledge-seed");
    expect(progressedData.activeRun.notes).toEqual({ seedKind: "note" });

    const recorded = await harness.executeTool("playbook_record_entity", {
      runId,
      entityType: "base",
      entityId: "first-note",
      purpose: "knowledge-seed",
    });
    expectSuccess(recorded);
    const recordedData = recorded.data as {
      activeRun: { createdEntities: unknown[] };
    };
    expect(recordedData.activeRun.createdEntities).toEqual([
      {
        entityType: "base",
        entityId: "first-note",
        purpose: "knowledge-seed",
      },
    ]);

    const completed = await harness.executeTool("playbook_complete", { runId });
    expectSuccess(completed);
    const completedData = completed.data as {
      activeRun: { status: string };
    };
    expect(completedData.activeRun.status).toBe("completed");
  });
});
