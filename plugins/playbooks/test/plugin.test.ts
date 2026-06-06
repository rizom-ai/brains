import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "bun:test";
import { AGENT_CONTEXT_REQUEST_CHANNEL } from "@brains/contracts";
import { playbookAdapter, type PlaybookBody } from "@brains/playbook";
import {
  createPluginHarness,
  expectError,
  expectSuccess,
} from "@brains/plugins/test";
import { playbooksPlugin, type PlaybookGateVerifier } from "../src";

async function tempStorageDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "brains-playbooks-"));
}

const welcomeState: PlaybookBody["states"][number] = {
  id: "welcome",
  title: "Welcome",
  instructions: ["Explain the playbook."],
  doneWhen: [],
  transitions: [
    { event: "NEXT", target: "seed", description: "Continue." },
    { event: "SKIP", target: "complete", description: "Skip." },
  ],
};

const seedState: PlaybookBody["states"][number] = {
  id: "seed",
  title: "Seed",
  instructions: ["Save a first note."],
  doneWhen: [],
  transitions: [{ event: "NEXT", target: "complete" }],
};

const completeState: PlaybookBody["states"][number] = {
  id: "complete",
  title: "Complete",
  instructions: ["Complete the run."],
  doneWhen: ["Run is complete."],
  transitions: [],
};

const playbookBody: PlaybookBody = {
  purpose: "Teach by doing.",
  operatingRules: ["Ask one question at a time."],
  initialState: "welcome",
  states: [welcomeState, seedState, completeState],
  finalStates: ["complete"],
  nextPrompts: ["Save this idea as a note..."],
};

type PluginHarness = ReturnType<typeof createPluginHarness>;

function addPlaybookEntity(
  harness: PluginHarness,
  body: PlaybookBody = playbookBody,
  id = "rover-onboarding",
): void {
  harness.addEntities([
    {
      id,
      entityType: "playbook",
      content: playbookAdapter.createPlaybookContent(
        {
          title: "Rover Onboarding",
          status: "active",
          audience: "anchor",
          completionMode: "agent-confirmed",
        },
        body,
      ),
      metadata: {
        title: "Rover Onboarding",
        status: "active",
        audience: "anchor",
        completionMode: "agent-confirmed",
      },
    },
  ]);
}

function gateVerifier(verify: PlaybookGateVerifier["verify"]): {
  verifier: PlaybookGateVerifier;
} {
  return { verifier: { verify } };
}

async function installHarness(): Promise<PluginHarness> {
  const harness = createPluginHarness({ dataDir: await tempStorageDir() });
  await harness.installPlugin(
    playbooksPlugin({ storageDir: await tempStorageDir() }),
  );
  addPlaybookEntity(harness);
  return harness;
}

async function startRun(
  harness: PluginHarness,
  channelId: string,
  playbookId = "rover-onboarding",
): Promise<string> {
  const started = await harness.executeTool(
    "playbook_start",
    {
      playbookId,
      lifecycle: "onboarding",
    },
    { channelId },
  );
  expectSuccess(started);
  return (started.data as { activeRun: { id: string } }).activeRun.id;
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
    addPlaybookEntity(harness);

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

  it("tracks playbook transitions and completion", async () => {
    const harness = createPluginHarness({ dataDir: await tempStorageDir() });
    await harness.installPlugin(
      playbooksPlugin({ storageDir: await tempStorageDir() }),
    );
    addPlaybookEntity(harness);

    const started = await harness.executeTool(
      "playbook_start",
      {
        playbookId: "rover-onboarding",
        lifecycle: "onboarding",
      },
      { channelId: "web-1" },
    );
    expectSuccess(started);
    const startedData = started.data as {
      activeRun: { id: string; currentState: string };
      validEvents: Array<{ event: string; target: string }>;
    };
    const runId = startedData.activeRun.id;
    expect(startedData.activeRun.currentState).toBe("welcome");
    expect(startedData.validEvents.map((event) => event.event)).toEqual([
      "NEXT",
      "SKIP",
    ]);

    const transitioned = await harness.executeTool("playbook_send_event", {
      runId,
      event: "NEXT",
      context: { operatorReady: true },
    });
    expectSuccess(transitioned);
    const transitionedData = transitioned.data as {
      activeRun: {
        currentState: string;
        completedStates: string[];
        context: Record<string, unknown>;
      };
    };
    expect(transitionedData.activeRun.currentState).toBe("seed");
    expect(transitionedData.activeRun.completedStates).toEqual(["welcome"]);
    expect(transitionedData.activeRun.context).toEqual({ operatorReady: true });

    const invalid = await harness.executeTool("playbook_send_event", {
      runId,
      event: "SKIP",
    });
    expectError(invalid);

    const tooEarly = await harness.executeTool("playbook_complete", { runId });
    expectError(tooEarly);

    const finalTransition = await harness.executeTool("playbook_send_event", {
      runId,
      event: "NEXT",
    });
    expectSuccess(finalTransition);

    const completed = await harness.executeTool("playbook_complete", { runId });
    expectSuccess(completed);
    const completedData = completed.data as {
      activeRun: { status: string; currentState: string };
    };
    expect(completedData.activeRun.status).toBe("completed");
    expect(completedData.activeRun.currentState).toBe("complete");
  });

  it("blocks gated NEXT when the verifier returns an unsatisfied verdict", async () => {
    const harness = createPluginHarness({ dataDir: await tempStorageDir() });
    await harness.installPlugin(
      playbooksPlugin(
        { storageDir: await tempStorageDir() },
        gateVerifier(async ({ conditions, stateId, evidenceWatermark }) =>
          conditions.map((condition) => ({
            stateId,
            condition,
            conditionHash: condition,
            evidenceWatermark,
            satisfied: false,
            source: "llm-judge",
            evidenceIds: [],
            claims: [],
            missing: ["No matching evidence."],
          })),
        ),
      ),
    );
    addPlaybookEntity(harness, {
      ...playbookBody,
      states: [
        {
          id: "welcome",
          title: "Welcome",
          instructions: ["Ask whether to continue."],
          doneWhen: [],
          transitions: [{ event: "NEXT", target: "identity" }],
        },
        {
          id: "identity",
          title: "Identity",
          instructions: ["Create or update the anchor profile."],
          doneWhen: ["The anchor profile has been created or updated."],
          transitions: [
            { event: "NEXT", target: "seed" },
            { event: "SKIP", target: "seed" },
          ],
        },
        seedState,
        completeState,
      ],
    });

    const runId = await startRun(harness, "web-unsatisfied-gate");
    expectSuccess(
      await harness.executeTool("playbook_send_event", {
        runId,
        event: "NEXT",
      }),
    );

    expectError(
      await harness.executeTool("playbook_send_event", {
        runId,
        event: "NEXT",
      }),
    );
    expectSuccess(
      await harness.executeTool("playbook_send_event", {
        runId,
        event: "SKIP",
      }),
    );
  });

  it("downgrades satisfied verdicts whose typed claims are unsupported by cited evidence", async () => {
    const harness = createPluginHarness({ dataDir: await tempStorageDir() });
    await harness.installPlugin(
      playbooksPlugin(
        { storageDir: await tempStorageDir() },
        gateVerifier(
          async ({ conditions, stateId, evidence, evidenceWatermark }) =>
            conditions.map((condition) => ({
              stateId,
              condition,
              conditionHash: condition,
              evidenceWatermark,
              satisfied: true,
              source: "llm-judge",
              evidenceIds: [evidence[0]?.id ?? "missing"],
              claims: [
                {
                  evidenceId: evidence[0]?.id ?? "missing",
                  kind: "entity_event",
                  data: { entityType: "anchor-profile", operation: "updated" },
                },
              ],
            })),
        ),
      ),
    );
    addPlaybookEntity(harness, {
      ...playbookBody,
      states: [
        {
          id: "welcome",
          title: "Welcome",
          instructions: ["Ask whether to continue."],
          doneWhen: [],
          transitions: [{ event: "NEXT", target: "identity" }],
        },
        {
          id: "identity",
          title: "Identity",
          instructions: ["Create or update the anchor profile."],
          doneWhen: ["The anchor profile has been created or updated."],
          transitions: [{ event: "NEXT", target: "seed" }],
        },
        seedState,
        completeState,
      ],
    });

    const runId = await startRun(harness, "web-unsupported-claim");
    expectSuccess(
      await harness.executeTool("playbook_send_event", {
        runId,
        event: "NEXT",
      }),
    );
    await harness.sendMessage(
      "entity:created",
      { runId, entityType: "base", entityId: "first-note" },
      "test",
      true,
    );

    const blocked = await harness.executeTool("playbook_send_event", {
      runId,
      event: "NEXT",
    });
    expectError(blocked);
  });

  it("resolves run-scoped tools from the active conversation playbook when runId is omitted", async () => {
    const harness = await installHarness();
    await startRun(harness, "web-scoped-tools");

    const status = await harness.executeTool(
      "playbook_status",
      {},
      { channelId: "web-scoped-tools" },
    );
    expectSuccess(status);
    expect(
      (status.data as { activeRun: { conversationId: string } }).activeRun
        .conversationId,
    ).toBe("web-scoped-tools");

    const transitioned = await harness.executeTool(
      "playbook_send_event",
      { event: "NEXT", context: { operatorReady: true } },
      { channelId: "web-scoped-tools" },
    );
    expectSuccess(transitioned);
    expect(
      (transitioned.data as { activeRun: { currentState: string } }).activeRun
        .currentState,
    ).toBe("seed");
  });

  it("errors when run-scoped tools cannot infer exactly one active conversation playbook", async () => {
    const harness = await installHarness();

    const missing = await harness.executeTool(
      "playbook_status",
      {},
      { channelId: "web-no-run" },
    );
    expectError(missing);

    addPlaybookEntity(harness, playbookBody, "rover-onboarding-alt");
    await startRun(harness, "web-ambiguous-run");
    await startRun(harness, "web-ambiguous-run", "rover-onboarding-alt");

    const ambiguous = await harness.executeTool(
      "playbook_send_event",
      { event: "NEXT" },
      { channelId: "web-ambiguous-run" },
    );
    expectError(ambiguous);
  });

  it("injects active playbook state as agent context", async () => {
    const harness = await installHarness();

    await startRun(harness, "web-agent-context");

    const response = await harness.sendMessage<
      {
        conversationId: string;
        message: string;
        interfaceType: string;
        channelId: string;
        channelName: string;
        userPermissionLevel: "anchor";
      },
      { items: Array<{ source: string; content: string }> }
    >(AGENT_CONTEXT_REQUEST_CHANNEL, {
      conversationId: "web-agent-context",
      message: "what next?",
      interfaceType: "web-chat",
      channelId: "web-agent-context",
      channelName: "Web Chat",
      userPermissionLevel: "anchor",
    });

    expect(response?.items).toHaveLength(1);
    expect(response?.items[0]?.source).toBe("active-playbook");
    expect(response?.items[0]?.content).toContain("Current state: welcome");
    expect(response?.items[0]?.content).toContain("NEXT -> seed");
  });

  it("injects actionable run identity and unsatisfied Done When gates as agent context", async () => {
    const harness = createPluginHarness({ dataDir: await tempStorageDir() });
    await harness.installPlugin(
      playbooksPlugin({ storageDir: await tempStorageDir() }),
    );
    addPlaybookEntity(harness, {
      ...playbookBody,
      states: [
        {
          id: "welcome",
          title: "Welcome",
          instructions: ["Ask whether to continue."],
          doneWhen: [],
          transitions: [{ event: "NEXT", target: "identity" }],
        },
        {
          id: "identity",
          title: "Identity",
          instructions: ["Create or update the anchor profile."],
          doneWhen: ["The anchor profile has been created or updated."],
          transitions: [
            { event: "NEXT", target: "seed" },
            { event: "SKIP", target: "seed" },
          ],
        },
        seedState,
        completeState,
      ],
    });

    const runId = await startRun(harness, "web-actionable-context");
    expectSuccess(
      await harness.executeTool("playbook_send_event", {
        runId,
        event: "NEXT",
      }),
    );

    const response = await harness.sendMessage<
      {
        conversationId: string;
        message: string;
        interfaceType: string;
        channelId: string;
        channelName: string;
        userPermissionLevel: "anchor";
      },
      { items: Array<{ source: string; content: string }> }
    >(AGENT_CONTEXT_REQUEST_CHANNEL, {
      conversationId: "web-actionable-context",
      message: "what next?",
      interfaceType: "web-chat",
      channelId: "web-actionable-context",
      channelName: "Web Chat",
      userPermissionLevel: "anchor",
    });

    expect(response?.items).toHaveLength(1);
    const content = response?.items[0]?.content ?? "";
    expect(content).toContain(`Run ID: ${runId}`);
    expect(content).toContain("Done when:");
    expect(content).toContain(
      "The anchor profile has been created or updated.",
    );
    expect(content).toContain("Verifier status:");
    expect(content).toContain("Not yet satisfied");
    expect(content).toContain("Valid events:");
    expect(content).toContain("SKIP -> seed");
    expect(content).toContain("Blocked events:");
    expect(content).toContain("NEXT -> seed");
  });
});
