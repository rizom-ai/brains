import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, mock } from "bun:test";
import {
  AGENT_ACTION_REQUEST_CHANNEL,
  AGENT_CONTEXT_REQUEST_CHANNEL,
} from "@brains/contracts";
import { playbookAdapter, type PlaybookBody } from "@brains/playbook";
import { z } from "@brains/utils";
import {
  createPluginHarness,
  expectError,
  expectSuccess,
} from "@brains/plugins/test";
import { playbooksPlugin, type GoalCheck, type GoalCheckInput } from "../src";

async function tempStorageDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "brains-playbooks-"));
}

const welcomeState: PlaybookBody["states"][number] = {
  id: "welcome",
  title: "Welcome",
  prompt: "Welcome. Would you like to continue?",
  instructions: ["Explain the playbook."],
  doneWhen: [],
  transitions: [
    {
      event: "NEXT",
      target: "seed",
      operatorAction: true,
      label: "Keep going",
      description: "Continue.",
      operatorDescription: "Continue to the first note.",
    },
    {
      event: "SKIP",
      target: "complete",
      operatorAction: true,
      label: "Skip",
      description: "Skip.",
      operatorDescription: "Skip this playbook.",
    },
  ],
};

const seedState: PlaybookBody["states"][number] = {
  id: "seed",
  title: "Seed",
  prompt: "What rough idea should Rover remember first?",
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

const transitionSchema = z
  .object({
    event: z.string().min(1),
    target: z.string().min(1),
  })
  .passthrough();

const runSummarySchema = z
  .object({
    id: z.string().min(1),
    currentState: z.string().min(1),
    status: z.string().optional(),
    lifecycle: z.string().optional(),
    conversationId: z.string().optional(),
    completedStates: z.array(z.string()).default([]),
    context: z.record(z.string(), z.unknown()).default({}),
    evidence: z.array(z.object({ kind: z.string() }).passthrough()).default([]),
    gateVerdicts: z
      .array(
        z
          .object({
            goal: z.array(z.string()),
            met: z.boolean(),
            reason: z.string(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

const playbookToolDataSchema = z
  .object({
    runs: z.array(runSummarySchema).default([]),
    activeRun: runSummarySchema,
    validEvents: z.array(transitionSchema).default([]),
    blockedEvents: z.array(transitionSchema).default([]),
    guidance: z.string().optional(),
    cards: z
      .array(
        z
          .object({
            kind: z.string(),
            actions: z.array(z.object({ event: z.string() }).passthrough()),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

function parsePlaybookToolData(
  input: unknown,
): z.infer<typeof playbookToolDataSchema> {
  return playbookToolDataSchema.parse(input);
}

function goalCheck(evaluate: GoalCheck["evaluate"]): {
  goalCheck: GoalCheck;
} {
  return { goalCheck: { evaluate } };
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
  conversationId: string,
  playbookId = "rover-onboarding",
): Promise<string> {
  const started = await harness.executeTool(
    "playbook_start",
    {
      playbookId,
      lifecycle: "onboarding",
    },
    { conversationId },
  );
  expectSuccess(started);
  return parsePlaybookToolData(started.data).activeRun.id;
}

describe("PlaybooksPlugin", () => {
  it("stores runs under runtime data by default, not content dataDir", async () => {
    const previousCwd = process.cwd();
    const runtimeDir = await tempStorageDir();
    const contentDataDir = await tempStorageDir();
    process.chdir(runtimeDir);
    try {
      const harness = createPluginHarness({ dataDir: contentDataDir });
      await harness.installPlugin(playbooksPlugin({}));
      addPlaybookEntity(harness);

      await startRun(harness, "conversation-uses-runtime-data-dir");

      expect(
        existsSync(join(runtimeDir, "data", "playbooks", "runs.json")),
      ).toBe(true);
      expect(existsSync(join(contentDataDir, "playbooks", "runs.json"))).toBe(
        false,
      );
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("registers a generic goalCheck eval handler", async () => {
    const harness = createPluginHarness({ dataDir: await tempStorageDir() });
    type RegisterEvalHandler = typeof harness.getMockShell extends () => infer T
      ? T extends { registerEvalHandler: infer TRegister }
        ? TRegister
        : never
      : never;
    type EvalHandler = Parameters<RegisterEvalHandler>[2];
    const handlers = new Map<string, EvalHandler>();
    harness.getMockShell().registerEvalHandler = (
      pluginId,
      handlerId,
      handler,
    ): void => {
      handlers.set(`${pluginId}:${handlerId}`, handler);
    };

    const evaluate = mock(async () => ({ met: true, reason: "goal met" }));
    await harness.installPlugin(
      playbooksPlugin(
        { storageDir: await tempStorageDir() },
        goalCheck(evaluate),
      ),
    );

    const handler = handlers.get("playbooks:goalCheck");
    expect(handler).toBeDefined();
    if (!handler) throw new Error("Expected goalCheck eval handler");

    const output = await handler({
      run: {
        id: "run-1",
        playbookId: "rover-onboarding",
        playbookVersion: "v1",
        conversationId: "conversation-1",
        currentState: "profile",
        status: "active",
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        completedStates: [],
        context: {},
        evidence: [],
        gateVerdicts: [],
      },
      state: {
        id: "profile",
        title: "Profile",
        instructions: ["Check the profile."],
        doneWhen: ["The anchor profile is known."],
        transitions: [],
      },
      goal: ["The anchor profile is known."],
      evidence: [],
    });

    expect(output).toEqual({ met: true, reason: "goal met" });
    expect(evaluate).toHaveBeenCalled();
  });

  it("keeps conversation routing out of model-visible playbook tool schemas", async () => {
    const harness = createPluginHarness({ dataDir: await tempStorageDir() });
    const capabilities = await harness.installPlugin(
      playbooksPlugin({ storageDir: await tempStorageDir() }),
    );

    for (const tool of capabilities.tools) {
      if (!tool.name.startsWith("playbook_")) continue;
      expect(Object.keys(tool.inputSchema)).not.toContain("conversationId");
    }
  });

  it("exposes only the small model-facing playbook tool surface", async () => {
    const harness = createPluginHarness({ dataDir: await tempStorageDir() });
    const capabilities = await harness.installPlugin(
      playbooksPlugin({ storageDir: await tempStorageDir() }),
    );

    const toolNames = capabilities.tools
      .map((tool) => tool.name)
      .filter((name) => name.startsWith("playbook_"))
      .sort();

    expect(toolNames).toEqual([
      "playbook_send_event",
      "playbook_start",
      "playbook_status",
    ]);
  });

  it("tells agents to avoid duplicate advances after evidence-backed progress", async () => {
    const harness = createPluginHarness({ dataDir: await tempStorageDir() });
    const capabilities = await harness.installPlugin(
      playbooksPlugin({ storageDir: await tempStorageDir() }),
    );
    const statusTool = capabilities.tools.find(
      (tool) => tool.name === "playbook_status",
    );
    if (!statusTool) throw new Error("playbook_status not found");

    expect(statusTool.description).toContain(
      "Do not send an extra NEXT after runtime evidence already advanced the run",
    );
    expect(statusTool.description).toContain(
      "Do not claim the playbook is finished",
    );
  });

  it("preserves an active run lifecycle when playbook_start is called again", async () => {
    const harness = createPluginHarness({ dataDir: await tempStorageDir() });
    await harness.installPlugin(
      playbooksPlugin({ storageDir: await tempStorageDir() }),
    );
    addPlaybookEntity(harness);

    const conversationId = "resume-preserve-lifecycle";
    const started = await harness.executeTool(
      "playbook_start",
      { playbookId: "rover-onboarding", lifecycle: "first-anchor-web-chat" },
      { conversationId },
    );
    expectSuccess(started);
    const restarted = await harness.executeTool(
      "playbook_start",
      { playbookId: "rover-onboarding", lifecycle: "onboarding" },
      { conversationId },
    );
    expectSuccess(restarted);

    const data = parsePlaybookToolData(restarted.data);
    expect(data.activeRun.lifecycle).toBe("first-anchor-web-chat");
  });

  it("deduplicates concurrent playbook_start calls for the same conversation", async () => {
    const harness = createPluginHarness({ dataDir: await tempStorageDir() });
    await harness.installPlugin(
      playbooksPlugin({ storageDir: await tempStorageDir() }),
    );
    addPlaybookEntity(harness);

    const conversationId = "concurrent-start-same-conversation";
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        harness.executeTool(
          "playbook_start",
          {
            playbookId: "rover-onboarding",
            lifecycle: "first-anchor-web-chat",
          },
          { conversationId },
        ),
      ),
    );
    const runIds = new Set<string>();
    for (const result of results) {
      if ("success" in result && result.success) {
        runIds.add(parsePlaybookToolData(result.data).activeRun.id);
      } else {
        expectSuccess(result);
        throw new Error("playbook_start failed");
      }
    }
    expect(runIds.size).toBe(1);

    const status = await harness.executeTool(
      "playbook_status",
      {},
      { conversationId },
    );
    expectSuccess(status);
    expect(parsePlaybookToolData(status.data).runs).toHaveLength(1);
  });

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

  it("fails loudly when a run's pinned playbook version no longer matches content", async () => {
    const harness = await installHarness();
    const runId = await startRun(harness, "web-stale-playbook");

    addPlaybookEntity(harness, {
      ...playbookBody,
      operatingRules: ["Changed after run start."],
    });

    const stale = await harness.executeTool("playbook_send_event", {
      runId,
      event: "NEXT",
    });

    expectError(stale);
    expect(stale.error).toContain("Playbook definition changed");
  });

  it("projects only operator choice events as structured action cards", async () => {
    const harness = await installHarness();

    const started = await harness.executeTool(
      "playbook_start",
      {
        playbookId: "rover-onboarding",
        lifecycle: "onboarding",
      },
      { conversationId: "web-action-card" },
    );
    expectSuccess(started);

    const data = parsePlaybookToolData(started.data);
    expect(data.cards).toEqual([
      {
        kind: "actions",
        id: `actions:playbook:${data.activeRun.id}`,
        title: "Rover Onboarding",
        defaultOpen: true,
        actions: [
          {
            type: "event",
            id: `playbook:${data.activeRun.id}:NEXT`,
            label: "Keep going",
            event: "NEXT",
            description: "Continue to the first note.",
          },
          {
            type: "event",
            id: `playbook:${data.activeRun.id}:SKIP`,
            label: "Skip",
            event: "SKIP",
            description: "Skip this playbook.",
          },
        ],
      },
    ]);
  });

  it("handles structured NEXT actions for the active conversation run", async () => {
    const harness = await installHarness();
    const runId = await startRun(harness, "web-action-next");

    const response = await harness.sendMessage<
      {
        conversationId: string;
        interfaceType: string;
        channelName: string;
        userPermissionLevel: "anchor";
        action: { type: "event"; event: "NEXT" };
      },
      {
        text: string;
        cards?: unknown[];
        toolResults?: Array<{
          toolName: string;
          args?: Record<string, unknown>;
          data?: unknown;
        }>;
        usage: {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        };
      }
    >(AGENT_ACTION_REQUEST_CHANNEL, {
      conversationId: "web-action-next",
      interfaceType: "web-chat",
      channelName: "Web Chat",
      userPermissionLevel: "anchor",
      action: { type: "event", event: "NEXT" },
    });

    expect(response).toBeDefined();
    expect(response?.text).toBe("What rough idea should Rover remember first?");
    expect(response?.text).not.toContain("Next:");
    expect(response?.text).not.toContain("Continuing.");
    expect(response?.cards).toBeUndefined();
    expect(response?.toolResults).toEqual([
      {
        toolName: "playbook_send_event",
        args: { runId, event: "NEXT" },
        data: expect.objectContaining({
          activeRun: expect.objectContaining({ currentState: "seed" }),
        }),
      },
    ]);

    const status = await harness.executeTool(
      "playbook_status",
      {},
      { conversationId: "web-action-next" },
    );
    expectSuccess(status);
    expect(parsePlaybookToolData(status.data).activeRun.currentState).toBe(
      "seed",
    );
  });

  it("starts and reports runs within the current conversation", async () => {
    const harness = createPluginHarness({ dataDir: await tempStorageDir() });
    await harness.installPlugin(
      playbooksPlugin({ storageDir: await tempStorageDir() }),
    );
    addPlaybookEntity(harness);

    const first = await harness.executeTool(
      "playbook_start",
      { playbookId: "rover-onboarding", lifecycle: "onboarding" },
      { conversationId: "conversation-one" },
    );
    expectSuccess(first);
    const firstRun = parsePlaybookToolData(first.data).activeRun;
    expect(firstRun.conversationId).toBe("conversation-one");

    const second = await harness.executeTool(
      "playbook_start",
      { playbookId: "rover-onboarding", lifecycle: "onboarding" },
      { conversationId: "conversation-two" },
    );
    expectSuccess(second);
    const secondRun = parsePlaybookToolData(second.data).activeRun;
    expect(secondRun.conversationId).toBe("conversation-two");
    expect(secondRun.id).not.toBe(firstRun.id);

    const status = await harness.executeTool(
      "playbook_status",
      { lifecycle: "onboarding" },
      { conversationId: "conversation-two" },
    );
    expectSuccess(status);
    const statusData = parsePlaybookToolData(status.data);
    expect(statusData.activeRun.id).toBe(secondRun.id);
    expect(statusData.runs).toHaveLength(1);
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
      { conversationId: "web-1" },
    );
    expectSuccess(started);
    const startedData = parsePlaybookToolData(started.data);
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
    const transitionedData = parsePlaybookToolData(transitioned.data);
    expect(transitionedData.activeRun.currentState).toBe("seed");
    expect(transitionedData.activeRun.completedStates).toEqual(["welcome"]);
    expect(transitionedData.activeRun.context).toEqual({ operatorReady: true });

    const invalid = await harness.executeTool("playbook_send_event", {
      runId,
      event: "SKIP",
    });
    expectError(invalid);

    const finalTransition = await harness.executeTool("playbook_send_event", {
      runId,
      event: "NEXT",
    });
    expectSuccess(finalTransition);
    const completedData = parsePlaybookToolData(finalTransition.data);
    expect(completedData.activeRun.status).toBe("completed");
    expect(completedData.activeRun.currentState).toBe("complete");
  });

  it("reports blocked gated NEXT with concise status guidance", async () => {
    const harness = createPluginHarness({ dataDir: await tempStorageDir() });
    await harness.installPlugin(
      playbooksPlugin(
        { storageDir: await tempStorageDir() },
        goalCheck(async () => ({
          met: false,
          reason: "No matching evidence.",
        })),
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

    const runId = await startRun(harness, "web-status-guidance");
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

    const status = await harness.executeTool("playbook_status", { runId });
    expectSuccess(status);
    const data = parsePlaybookToolData(status.data);
    expect(data.validEvents.map((event) => event.event)).toEqual(["SKIP"]);
    expect(data.blockedEvents.map((event) => event.event)).toEqual(["NEXT"]);
    expect(data.guidance).toContain("Current state: identity");
    expect(data.guidance).toContain("No matching evidence.");
  });

  it("uses context judge for production goal checks when no stub is injected", async () => {
    const harness = createPluginHarness({ dataDir: await tempStorageDir() });
    const judge = mock(async () => ({
      verdict: { met: true, reason: "The KB contains the requested outcome." },
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }));
    Object.assign(harness.getMockShell(), { judge });
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
          instructions: ["Capture the operator identity."],
          doneWhen: ["The brain knows who the operator is."],
          transitions: [{ event: "NEXT", target: "complete" }],
        },
        completeState,
      ],
    });

    const runId = await startRun(harness, "web-context-judge");
    expectSuccess(
      await harness.executeTool("playbook_send_event", {
        runId,
        event: "NEXT",
      }),
    );
    const advanced = await harness.executeTool("playbook_send_event", {
      runId,
      event: "NEXT",
    });

    expectSuccess(advanced);
    expect(parsePlaybookToolData(advanced.data).activeRun.currentState).toBe(
      "complete",
    );
    expect(judge).toHaveBeenCalledWith(
      expect.objectContaining({
        instruction: expect.stringContaining("playbook goal"),
        material: expect.stringContaining(
          "The brain knows who the operator is.",
        ),
      }),
    );
  });

  it("records judge errors as blocking goal status", async () => {
    const harness = createPluginHarness({ dataDir: await tempStorageDir() });
    Object.assign(harness.getMockShell(), {
      judge: mock(async () => {
        throw new Error("judge unavailable");
      }),
    });
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
          instructions: ["Capture the operator identity."],
          doneWhen: ["The brain knows who the operator is."],
          transitions: [{ event: "NEXT", target: "complete" }],
        },
        completeState,
      ],
    });

    const runId = await startRun(harness, "web-judge-error");
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

    const status = await harness.executeTool("playbook_status", { runId });
    expectSuccess(status);
    expect(parsePlaybookToolData(status.data).guidance).toContain(
      "judge unavailable",
    );
  });

  it("includes entity details in runtime evidence for generic goal checks", async () => {
    const evaluate = mock(async (input: GoalCheckInput) => {
      expect(input.evidence[0]?.data).toMatchObject({
        entityType: "base",
        entityId: "seed-note",
        operation: "created",
        title: "Seed note",
        contentPreview: "Rough idea worth remembering.",
      });
      return { met: true, reason: "The seed note was recorded." };
    });
    const harness = createPluginHarness({ dataDir: await tempStorageDir() });
    await harness.installPlugin(
      playbooksPlugin(
        { storageDir: await tempStorageDir() },
        goalCheck(evaluate),
      ),
    );
    addPlaybookEntity(harness, {
      ...playbookBody,
      states: [
        {
          id: "welcome",
          title: "Welcome",
          instructions: ["Save a seed."],
          doneWhen: ["A first knowledge seed has been saved."],
          transitions: [{ event: "NEXT", target: "complete" }],
        },
        completeState,
      ],
    });

    const conversationId = "web-runtime-evidence-details";
    const runId = await startRun(harness, conversationId);

    await harness.sendMessage(
      "entity:created",
      {
        entityType: "base",
        entityId: "seed-note",
        conversationId,
        entity: {
          metadata: { title: "Seed note" },
          content: "Rough idea worth remembering.",
        },
      },
      "entity-service",
      true,
    );

    const status = await harness.executeTool("playbook_status", { runId });
    expectSuccess(status);
    const data = parsePlaybookToolData(status.data);
    expect(data.activeRun.currentState).toBe("complete");
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it("auto-advances a gated NEXT after runtime evidence satisfies it", async () => {
    const evaluate = mock(async (input) => {
      expect(input.evidence).toHaveLength(1);
      return {
        met: true,
        reason: "The profile update was recorded as runtime evidence.",
      };
    });
    const harness = createPluginHarness({ dataDir: await tempStorageDir() });
    await harness.installPlugin(
      playbooksPlugin(
        { storageDir: await tempStorageDir() },
        goalCheck(evaluate),
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

    const conversationId = "web-runtime-evidence-gate";
    const runId = await startRun(harness, conversationId);
    expectSuccess(
      await harness.executeTool("playbook_send_event", {
        runId,
        event: "NEXT",
      }),
    );

    await harness.sendMessage(
      "entity:updated",
      {
        entityType: "anchor-profile",
        entityId: "anchor-profile",
        conversationId,
      },
      "entity-service",
      true,
    );

    const status = await harness.executeTool("playbook_status", { runId });
    expectSuccess(status);
    const data = parsePlaybookToolData(status.data);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(data.activeRun.currentState).toBe("seed");
    expect(data.activeRun.completedStates).toEqual(["welcome", "identity"]);
    expect(data.activeRun.gateVerdicts).toContainEqual(
      expect.objectContaining({
        goal: ["The anchor profile has been created or updated."],
        met: true,
        reason: "The profile update was recorded as runtime evidence.",
      }),
    );
  });

  it("blocks gated NEXT when the goal check returns not met", async () => {
    const harness = createPluginHarness({ dataDir: await tempStorageDir() });
    await harness.installPlugin(
      playbooksPlugin(
        { storageDir: await tempStorageDir() },
        goalCheck(async () => ({
          met: false,
          reason: "No matching evidence.",
        })),
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

  it("advances gated NEXT when the goal check returns met", async () => {
    const harness = createPluginHarness({ dataDir: await tempStorageDir() });
    await harness.installPlugin(
      playbooksPlugin(
        { storageDir: await tempStorageDir() },
        goalCheck(async () => ({
          met: true,
          reason: "The profile exists in the KB.",
        })),
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

    const runId = await startRun(harness, "web-met-gate");
    expectSuccess(
      await harness.executeTool("playbook_send_event", {
        runId,
        event: "NEXT",
      }),
    );

    const advanced = await harness.executeTool("playbook_send_event", {
      runId,
      event: "NEXT",
    });
    expectSuccess(advanced);
    const activeRun = parsePlaybookToolData(advanced.data).activeRun;
    expect(activeRun.currentState).toBe("seed");
    expect(activeRun.gateVerdicts).toContainEqual(
      expect.objectContaining({
        goal: ["The anchor profile has been created or updated."],
        met: true,
        reason: "The profile exists in the KB.",
      }),
    );
  });

  it("resolves run-scoped tools from the active conversation playbook when runId is omitted", async () => {
    const harness = await installHarness();
    await startRun(harness, "web-scoped-tools");

    const status = await harness.executeTool(
      "playbook_status",
      {},
      { conversationId: "web-scoped-tools" },
    );
    expectSuccess(status);
    expect(parsePlaybookToolData(status.data).activeRun.conversationId).toBe(
      "web-scoped-tools",
    );

    const transitioned = await harness.executeTool(
      "playbook_send_event",
      { event: "NEXT", context: { operatorReady: true } },
      { conversationId: "web-scoped-tools" },
    );
    expectSuccess(transitioned);
    expect(
      parsePlaybookToolData(transitioned.data).activeRun.currentState,
    ).toBe("seed");
  });

  it("ignores spoofed conversationId tool args and uses tool context for run inference", async () => {
    const harness = await installHarness();
    await startRun(harness, "real-conversation");

    const status = await harness.executeTool(
      "playbook_status",
      { conversationId: "fake-conversation" },
      { conversationId: "real-conversation" },
    );

    expectSuccess(status);
    expect(parsePlaybookToolData(status.data).activeRun.conversationId).toBe(
      "real-conversation",
    );
  });

  it("errors when run-scoped tools cannot infer exactly one active conversation playbook", async () => {
    const harness = await installHarness();

    const missing = await harness.executeTool(
      "playbook_status",
      {},
      { conversationId: "web-no-run" },
    );
    expectError(missing);

    addPlaybookEntity(harness, playbookBody, "rover-onboarding-alt");
    await startRun(harness, "web-ambiguous-run");
    await startRun(harness, "web-ambiguous-run", "rover-onboarding-alt");

    const ambiguous = await harness.executeTool(
      "playbook_send_event",
      { event: "NEXT" },
      { conversationId: "web-ambiguous-run" },
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
    expect(response?.items[0]?.content).toContain(
      "Current state title: Welcome",
    );
    expect(response?.items[0]?.content).toContain(
      "Current state id (tool use only): welcome",
    );
    expect(response?.items[0]?.content).toContain(
      "Do not mention raw playbook state IDs to the operator",
    );
    expect(response?.items[0]?.content).toContain("NEXT -> seed");
  });

  it("injects completed-state anti-repetition guidance as agent context", async () => {
    const harness = await installHarness();
    const runId = await startRun(harness, "web-agent-context-completed");
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
      conversationId: "web-agent-context-completed",
      message: "transform it now",
      interfaceType: "web-chat",
      channelId: "web-agent-context-completed",
      channelName: "Web Chat",
      userPermissionLevel: "anchor",
    });

    const content = response?.items[0]?.content ?? "";
    expect(content).toContain("Current state title: Seed");
    expect(content).toContain("Current state id (tool use only): seed");
    expect(content).toContain("Completed states:");
    expect(content).toContain("- welcome");
    expect(content).toContain("Do not redo completed states");
    expect(content).toContain(
      "ask only for what is missing in the current state",
    );
    expect(content).toContain(
      "After meaningful tool actions, refresh playbook_status",
    );
    expect(content).toContain(
      "end the turn with the next immediate question or action",
    );
    expect(content).toContain(
      "If the operator says yes, continue, or otherwise accepts the current playbook step, send the matching valid event",
    );
    expect(content).toContain(
      "After a playbook event advances the run, answer from the new current state rather than repeating the previous state prompt",
    );
    expect(content).toContain(
      "Avoid state-machine phrasing like stage, state, or run progress in operator-facing chat",
    );
    expect(content).toContain(
      "Call playbook tools silently; never write tool names like playbook_status or playbook_send_event in operator-facing text",
    );
    expect(content).toContain(
      "If the operator gives an ambiguous continuation like 'go ahead'",
    );
    expect(content).toContain("do not start unrelated maintenance tasks");
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
            { event: "SKIP", target: "seed", label: "Skip for now" },
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
    expect(content).toContain("Goal status:");
    expect(content).toContain("Not yet met");
    expect(content).toContain("Valid events:");
    expect(content).toContain("SKIP -> seed: Skip for now");
    expect(content).toContain("Blocked events:");
    expect(content).toContain("NEXT -> seed");
  });
});
