import { describe, it, expect } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import {
  LifecycleStarterRegistry,
  type LifecyclePlaybookConfig,
  type StarterPlaybook,
} from "../src/lib/lifecycle-starters";

const logger = createSilentLogger();

function playbook(overrides?: {
  id?: string;
  status?: string;
  audience?: string;
  trigger?: string;
  lifecycle?: string;
  once?: boolean;
  starterText?: string;
  starterPrompt?: string;
}): StarterPlaybook {
  return {
    entity: {
      id: overrides?.id ?? "onboarding-v1",
      metadata: {
        title: "Onboarding",
        status: overrides?.status ?? "active",
        audience: overrides?.audience ?? "anchor",
        ...(overrides?.trigger ? { trigger: overrides.trigger } : {}),
        ...(overrides?.lifecycle ? { lifecycle: overrides.lifecycle } : {}),
        ...(overrides?.once !== undefined ? { once: overrides.once } : {}),
        ...(overrides?.starterText
          ? { starterText: overrides.starterText }
          : {}),
        ...(overrides?.starterPrompt
          ? { starterPrompt: overrides.starterPrompt }
          : {}),
      },
    },
    body: { purpose: "Guide the operator through setup" },
  };
}

function lifecycleConfig(
  overrides?: Partial<LifecyclePlaybookConfig>,
): LifecyclePlaybookConfig {
  return {
    trigger: "first-run",
    playbookId: "onboarding-v1",
    once: true,
    starterText: "Set up your brain",
    starterPrompt: "Start the onboarding playbook.",
    ...overrides,
  };
}

function createRegistry(options?: {
  configuredLifecycle?: Record<string, LifecyclePlaybookConfig>;
  triggers?: Record<string, boolean>;
  runsByLifecycle?: Record<string, { status: string }>;
  playbooks?: StarterPlaybook[];
}): LifecycleStarterRegistry {
  const playbooks = options?.playbooks ?? [playbook()];
  return new LifecycleStarterRegistry({
    logger,
    configuredLifecycle: options?.configuredLifecycle ?? {},
    triggers: options?.triggers ?? {},
    findRunByLifecycle: async (lifecycle) =>
      options?.runsByLifecycle?.[lifecycle],
    getPlaybook: async (playbookId) =>
      playbooks.find((candidate) => candidate.entity.id === playbookId),
    listPlaybooks: async () => playbooks,
  });
}

const anchorWebChat = {
  interfaceType: "web-chat",
  userPermissionLevel: "anchor" as const,
};

describe("LifecycleStarterRegistry.register", () => {
  const registration = {
    id: "onboarding",
    trigger: "first-run",
    playbookId: "onboarding-v1",
    once: true,
    starterText: "Set up your brain",
    starterPrompt: "Start the onboarding playbook.",
  };

  it("registers a new starter and accepts an identical re-registration", () => {
    const registry = createRegistry();

    expect(registry.register(registration, "rover-onboarding")).toEqual({
      registered: true,
      id: "onboarding",
    });
    expect(registry.register(registration, "rover-onboarding")).toEqual({
      registered: true,
      id: "onboarding",
    });
  });

  it("ignores a conflicting registration from another source", () => {
    const registry = createRegistry();
    registry.register(registration, "rover-onboarding");

    const conflict = registry.register(
      { ...registration, starterText: "Different" },
      "other-plugin",
    );

    expect(conflict.registered).toBe(false);
    expect(conflict.ignored).toBe(true);
    expect(conflict.reason).toContain("already registered");
  });
});

describe("LifecycleStarterRegistry.resolveStarters", () => {
  it("only serves anchor operators on web-chat", async () => {
    const registry = createRegistry({
      configuredLifecycle: { onboarding: lifecycleConfig() },
    });

    expect(
      await registry.resolveStarters({
        interfaceType: "matrix",
        userPermissionLevel: "anchor",
      }),
    ).toEqual([]);
    expect(
      await registry.resolveStarters({
        interfaceType: "web-chat",
        userPermissionLevel: "public",
      }),
    ).toEqual([]);
  });

  it("resolves configured lifecycles against active playbooks", async () => {
    const registry = createRegistry({
      configuredLifecycle: { onboarding: lifecycleConfig() },
    });

    const starters = await registry.resolveStarters(anchorWebChat);

    expect(starters).toEqual([
      {
        id: "onboarding",
        title: "Set up your brain",
        playbookId: "onboarding-v1",
        lifecycle: "onboarding",
        starterPrompt: "Start the onboarding playbook.",
      },
    ]);
  });

  it("skips once-lifecycles whose run already completed", async () => {
    const registry = createRegistry({
      configuredLifecycle: { onboarding: lifecycleConfig() },
      runsByLifecycle: { onboarding: { status: "completed" } },
    });

    expect(await registry.resolveStarters(anchorWebChat)).toEqual([]);
  });

  it("skips configured lifecycles whose playbook is not active", async () => {
    const registry = createRegistry({
      configuredLifecycle: { onboarding: lifecycleConfig() },
      playbooks: [playbook({ status: "draft" })],
    });

    expect(await registry.resolveStarters(anchorWebChat)).toEqual([]);
  });

  it("merges registered starters without duplicating configured ids", async () => {
    const registry = createRegistry({
      configuredLifecycle: { onboarding: lifecycleConfig() },
    });
    registry.register(
      {
        id: "onboarding",
        trigger: "first-run",
        playbookId: "onboarding-v1",
        once: true,
        starterText: "Registered duplicate",
        starterPrompt: "Start again.",
      },
      "rover-onboarding",
    );
    registry.register(
      {
        id: "weekly-review",
        trigger: "weekly",
        playbookId: "onboarding-v1",
        once: false,
        starterText: "Weekly review",
        starterPrompt: "Start the weekly review.",
      },
      "rover-onboarding",
    );

    const starters = await registry.resolveStarters(anchorWebChat);

    expect(starters.map((starter) => starter.id)).toEqual([
      "onboarding",
      "weekly-review",
    ]);
    // The configured entry wins over the registered duplicate.
    expect(starters[0]?.title).toBe("Set up your brain");
  });

  it("scans playbook triggers only when enabled and respects once", async () => {
    const triggered = playbook({
      id: "content-v1",
      trigger: "content",
      starterText: "Plan content",
      starterPrompt: "Start the content playbook.",
    });
    const registry = createRegistry({
      triggers: { content: true, other: false },
      playbooks: [triggered],
    });

    const starters = await registry.resolveStarters(anchorWebChat);
    expect(starters).toEqual([
      {
        id: "content-v1",
        title: "Plan content",
        description: "Guide the operator through setup",
        playbookId: "content-v1",
        lifecycle: "content-v1",
        starterPrompt: "Start the content playbook.",
      },
    ]);

    const completed = createRegistry({
      triggers: { content: true },
      playbooks: [triggered],
      runsByLifecycle: { "content-v1": { status: "completed" } },
    });
    expect(await completed.resolveStarters(anchorWebChat)).toEqual([]);
  });

  it("filters to a single lifecycle when requested", async () => {
    const registry = createRegistry({
      configuredLifecycle: {
        onboarding: lifecycleConfig(),
        review: lifecycleConfig({ starterText: "Review" }),
      },
    });

    const starters = await registry.resolveStarters({
      ...anchorWebChat,
      lifecycle: "review",
    });
    expect(starters.map((starter) => starter.id)).toEqual(["review"]);
  });
});
