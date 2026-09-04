import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  brainCharacterBodySchema,
  parseMarkdownWithFrontmatter,
  type BaseEntity,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import {
  STARTER_ALIAS_REGISTER,
  buildStarterCharacterBrief,
  deriveStarterIdentity,
  generatedStarterCharacterSchema,
  isLegacyAnchorProfileContent,
  isLegacyBrainCharacterContent,
  resolveStarterIdentityIdentifier,
  seedOrMigrateStarterIdentity,
  type GeneratedStarterCharacter,
  type StarterIdentityStore,
} from "../src";
import { profilePlugin } from "./helpers/install";

const rawFrontmatterSchema = z.record(z.string(), z.unknown());

function createHarness(
  domain: string = "notes.example.com",
  profileKind?: string,
): ReturnType<typeof createPluginHarness> {
  return createPluginHarness({
    dataDir: `/tmp/test-starter-identity-${randomUUID()}`,
    domain,
    ...(profileKind && { profileKind }),
  });
}

const generatedCharacter: GeneratedStarterCharacter = {
  role: "Connected knowledge operator",
  purpose:
    "Connect available knowledge into grounded material that people can use.",
  values: ["source fidelity", "clear context", "useful synthesis"],
};

const currentLegacyBrain = `---
name: Brain
role: Knowledge assistant
purpose: Help organize, understand, and retrieve information from your knowledge base
values:
  - clarity
  - accuracy
  - helpfulness
---
`;

const personalLegacyBrain = `---
name: Personal Brain
role: Personal knowledge assistant
purpose: Help organize, understand, and retrieve information from your personal knowledge base
values:
  - clarity
  - accuracy
  - helpfulness
---
`;

const legacyAnchor = `---
name: Unknown
kind: person
---
`;

describe("starter identity derivation", () => {
  test("is deterministic for the same canonical domain", () => {
    const first = deriveStarterIdentity("domain:notes.example.com");
    const second = deriveStarterIdentity("domain:notes.example.com");

    expect(second).toEqual(first);
  });

  test("does not couple alias derivation to profile classification", () => {
    expect(deriveStarterIdentity("domain:notes.example.com")).toEqual({
      name: expect.any(String),
    });
  });

  test("keeps unsafe classic-generator terms out of the local register", () => {
    const terms = [
      ...STARTER_ALIAS_REGISTER.first,
      ...STARTER_ALIAS_REGISTER.second,
    ].map((term) => term.toLowerCase());
    const prohibited = [
      "assassin",
      "bastard",
      "criminal",
      "destroyer",
      "drunken",
      "killah",
      "violent",
      "vulgar",
    ];

    expect(terms.filter((term) => prohibited.includes(term))).toEqual([]);
  });

  test("normalizes the canonical domain and equivalent did:web spelling", () => {
    expect(
      resolveStarterIdentityIdentifier({
        domain: "https://Notes.Example.com/anything",
      }),
    ).toBe("domain:notes.example.com");
    expect(
      resolveStarterIdentityIdentifier({
        didWeb: "did:web:Notes.Example.com",
      }),
    ).toBe("domain:notes.example.com");
    expect(
      resolveStarterIdentityIdentifier({ didWeb: "did:plc:account" }),
    ).toBeNull();
    expect(
      resolveStarterIdentityIdentifier({
        didWeb: "did:web:notes.example.com:brain",
      }),
    ).toBeNull();
  });
});

describe("starter character generation", () => {
  test("validates concise structured character fields", () => {
    expect(generatedStarterCharacterSchema.parse(generatedCharacter)).toEqual(
      generatedCharacter,
    );
    expect(
      generatedStarterCharacterSchema.safeParse({
        ...generatedCharacter,
        values: ["clear context", "clear context", "source fidelity"],
      }).success,
    ).toBe(false);
    expect(
      generatedStarterCharacterSchema.safeParse({
        ...generatedCharacter,
        role: "Agent",
      }).success,
    ).toBe(false);
  });

  test("builds a bounded factual brief without markdown bodies", async () => {
    const harness = createHarness();
    const longTitle = `Signal ${"x".repeat(220)}`;
    harness.addEntities([
      {
        id: "anchor-profile",
        entityType: "anchor-profile",
        content:
          "---\nname: Example Team\nkind: team\npurpose: Share reliable context\n---\nPRIVATE ANCHOR BODY",
        metadata: {},
      },
      {
        id: "style-guide",
        entityType: "style-guide",
        content:
          "---\nname: House style\nmessaging:\n  positioning: Evidence before assertion\nvoice:\n  traits:\n    - direct\n---\nPRIVATE STYLE BODY",
        metadata: {},
      },
      ...Array.from({ length: 16 }, (_, index) => ({
        id: `topic-${index}`,
        entityType: "topic",
        content: `---\ntitle: ${index === 0 ? longTitle : `Topic ${index}`}\nsummary: Useful topic ${index}\n---\nPRIVATE CONTENT BODY ${index}`,
        metadata: {},
      })),
    ]);

    const anchorEntity = await harness.getEntityService().getEntity({
      entityType: "anchor-profile",
      id: "anchor-profile",
      visibilityScope: "restricted",
    });
    const brief = await buildStarterCharacterBrief({
      entityService: harness.getEntityService(),
      profileKind: "team",
      profileCategory: "team",
      anchorEntity,
      includeAnchor: true,
    });
    const serialized = JSON.stringify(brief);

    expect(brief.capabilities).toContainEqual({
      entityType: "topic",
      count: 16,
    });
    expect(brief.contentSignals).toHaveLength(12);
    expect(brief.contentSignals.every(({ label }) => label.length <= 160)).toBe(
      true,
    );
    expect(brief.anchorSignals).toContain("name: Example Team");
    expect(brief.styleSignals).toContain(
      "messaging.positioning: Evidence before assertion",
    );
    expect(serialized).not.toContain("PRIVATE CONTENT BODY");
    expect(serialized).not.toContain("PRIVATE ANCHOR BODY");
    expect(serialized).not.toContain("PRIVATE STYLE BODY");
  });

  test("excludes content signals containing non-identity model labels", async () => {
    const harness = createHarness();
    harness.addEntities([
      {
        id: "legacy-model-topic",
        entityType: "topic",
        content: "---\ntitle: Rover migration notes\n---\n",
        metadata: {},
      },
      {
        id: "safe-topic",
        entityType: "topic",
        content: "---\ntitle: Knowledge graph design\n---\n",
        metadata: {},
      },
    ]);

    const brief = await buildStarterCharacterBrief({
      entityService: harness.getEntityService(),
      profileKind: "professional",
      profileCategory: "person",
      anchorEntity: null,
      includeAnchor: false,
    });
    const serialized = JSON.stringify(brief);

    expect(serialized).toContain("Knowledge graph design");
    expect(serialized).not.toContain("Rover migration notes");
  });
});

describe("legacy default fingerprints", () => {
  test("recognizes every known brain-character default", () => {
    expect(isLegacyBrainCharacterContent(currentLegacyBrain)).toBe(true);
    expect(isLegacyBrainCharacterContent(personalLegacyBrain)).toBe(true);
  });

  test("rejects partial customization and unknown fields", () => {
    expect(
      isLegacyBrainCharacterContent(
        currentLegacyBrain.replace(
          "role: Knowledge assistant",
          "role: Research partner",
        ),
      ),
    ).toBe(false);
    expect(
      isLegacyBrainCharacterContent(
        currentLegacyBrain.replace("name: Brain", "name: Brain\nnote: Mine"),
      ),
    ).toBe(false);
  });

  test("recognizes content-owned and base-only anchor defaults", () => {
    expect(isLegacyAnchorProfileContent(legacyAnchor)).toBe(true);
    expect(isLegacyAnchorProfileContent("---\nname: Unknown\n---\n")).toBe(
      true,
    );
    expect(
      isLegacyAnchorProfileContent(
        `${legacyAnchor}\nThis profile has been customized.`,
      ),
    ).toBe(false);
    expect(
      isLegacyAnchorProfileContent(
        "---\nname: Unknown\nkind: person\nintro: Custom\n---\n",
      ),
    ).toBe(false);
  });
});

/**
 * An in-memory identity store. Seeding is a function of what it read and
 * what it wrote, so the assertions that used to need a shell, a harness and
 * two message signals are now direct.
 */
function createIdentityStore(seed: Record<string, string> = {}): {
  store: StarterIdentityStore;
  contents: Map<string, string>;
  creates: string[];
} {
  const contents = new Map(Object.entries(seed));
  const creates: string[] = [];
  const store: StarterIdentityStore = {
    getEntity: async ({
      entityType,
      id,
    }: {
      entityType: string;
      id: string;
    }): Promise<BaseEntity | null> => {
      const content = contents.get(id);
      return content === undefined
        ? null
        : {
            id,
            entityType,
            content,
            metadata: {},
            created: "2026-01-01T00:00:00.000Z",
            updated: "2026-01-01T00:00:00.000Z",
            visibility: "restricted",
            contentHash: `hash-${id}`,
          };
    },
    create: async (entity): Promise<void> => {
      creates.push(entity.entityType);
      contents.set(entity.id, entity.content);
    },
    update: async (entity): Promise<void> => {
      contents.set(entity.id, entity.content);
    },
  };
  return { store, contents, creates };
}

const IDENTIFIER = "domain:notes.example.com";

describe("starter identity seeding", () => {
  test("seeds both singletons when neither exists", async () => {
    const { store, contents } = createIdentityStore();
    let generations = 0;

    const result = await seedOrMigrateStarterIdentity({
      entityService: store,
      identifier: IDENTIFIER,
      profileKind: "team",
      profileCategory: "team",
      generateBrainCharacter: async () => {
        generations += 1;
        return generatedCharacter;
      },
    });

    expect(result.brainCharacter).toBe("created");
    expect(result.anchorProfile).toBe("created");
    expect(generations).toBe(1);

    const brain = contents.get("brain-character");
    const anchor = contents.get("anchor-profile");
    if (!brain || !anchor) throw new Error("Starter identity was not created");

    const character = parseMarkdownWithFrontmatter(
      brain,
      brainCharacterBodySchema,
    ).metadata;
    const profile = parseMarkdownWithFrontmatter(anchor, rawFrontmatterSchema);
    expect(character.name).not.toBe("Brain");
    expect(character.role).toBe(generatedCharacter.role);
    expect(character.values).toEqual(generatedCharacter.values);
    expect(profile.metadata).not.toHaveProperty("kind");
    expect(profile.metadata["name"]).toBe(`Anchor for ${character.name}`);
    expect(profile.content).toContain("picked");
  });

  test("migrates exact defaults and is idempotent", async () => {
    const { store, contents } = createIdentityStore({
      "brain-character": currentLegacyBrain,
      "anchor-profile": legacyAnchor,
    });
    let generations = 0;
    const generate = async (): Promise<GeneratedStarterCharacter> => {
      generations += 1;
      return generatedCharacter;
    };

    await seedOrMigrateStarterIdentity({
      entityService: store,
      identifier: IDENTIFIER,
      generateBrainCharacter: generate,
    });
    const migratedBrain = contents.get("brain-character");
    const migratedAnchor = contents.get("anchor-profile");

    const repeated = await seedOrMigrateStarterIdentity({
      entityService: store,
      identifier: IDENTIFIER,
      generateBrainCharacter: generate,
    });

    expect(migratedBrain).not.toBe(currentLegacyBrain);
    expect(migratedAnchor).not.toBe(legacyAnchor);
    expect(contents.get("brain-character")).toBe(migratedBrain);
    expect(contents.get("anchor-profile")).toBe(migratedAnchor);
    expect(repeated.brainCharacter).toBe("unchanged");
    expect(repeated.anchorProfile).toBe("unchanged");
    expect(generations).toBe(1);
  });

  test("recognizes the personal-brain default as legacy too", async () => {
    const { store, contents } = createIdentityStore({
      "brain-character": personalLegacyBrain,
    });

    await seedOrMigrateStarterIdentity({
      entityService: store,
      identifier: IDENTIFIER,
      generateBrainCharacter: async () => generatedCharacter,
    });

    expect(contents.get("brain-character")).not.toBe(personalLegacyBrain);
  });

  test("migrates a legacy anchor without generating over a customized brain", async () => {
    const customBrain = `---
name: Atlas
role: Research partner
purpose: Keep project knowledge connected
values:
  - context
---
`;
    const { store, contents } = createIdentityStore({
      "brain-character": customBrain,
      "anchor-profile": legacyAnchor,
    });
    let generations = 0;

    await seedOrMigrateStarterIdentity({
      entityService: store,
      identifier: IDENTIFIER,
      generateBrainCharacter: async () => {
        generations += 1;
        throw new Error("AI should not be called");
      },
    });

    expect(contents.get("brain-character")).toBe(customBrain);
    expect(contents.get("anchor-profile")).toContain("name: Anchor for Atlas");
    expect(generations).toBe(0);
  });

  test("preserves authored identity without taking the create branch", async () => {
    const customBrain = `---
name: Atlas
role: Research partner
purpose: Keep project knowledge connected
values:
  - context
---
`;
    const customAnchor = `---
name: Ada
kind: person
intro: Custom profile
---
Authored story.
`;
    const { store, contents, creates } = createIdentityStore({
      "brain-character": customBrain,
      "anchor-profile": customAnchor,
    });
    let generations = 0;

    const result = await seedOrMigrateStarterIdentity({
      entityService: store,
      identifier: IDENTIFIER,
      generateBrainCharacter: async () => {
        generations += 1;
        return generatedCharacter;
      },
    });

    expect(contents.get("brain-character")).toBe(customBrain);
    expect(contents.get("anchor-profile")).toBe(customAnchor);
    expect(creates).toEqual([]);
    expect(result.brainCharacter).toBe("unchanged");
    expect(result.anchorProfile).toBe("unchanged");
    expect(generations).toBe(0);
  });

  test("writes nothing when generation fails, and seeds on a later attempt", async () => {
    const { store, contents } = createIdentityStore();
    let shouldFail = true;
    const generate = async (): Promise<GeneratedStarterCharacter> => {
      if (shouldFail) throw new Error("Provider unavailable");
      return generatedCharacter;
    };

    // The failure escapes: the queue retries the job rather than the flow
    // waiting for another initial-sync signal that may never arrive.
    expect(
      seedOrMigrateStarterIdentity({
        entityService: store,
        identifier: IDENTIFIER,
        generateBrainCharacter: generate,
      }),
    ).rejects.toThrow("Provider unavailable");
    expect(contents.size).toBe(0);

    shouldFail = false;
    await seedOrMigrateStarterIdentity({
      entityService: store,
      identifier: IDENTIFIER,
      generateBrainCharacter: generate,
    });

    expect(contents.get("brain-character")).toBeDefined();
    expect(contents.get("anchor-profile")).toBeDefined();
  });
});

describe("the starter identity boot gate", () => {
  /** Record what the plugin enqueues, in order. */
  function captureEnqueues(
    harness: ReturnType<typeof createHarness>,
  ): string[] {
    const enqueued: string[] = [];
    const queue = harness.getMockShell().getJobQueueService();
    const enqueue = queue.enqueue.bind(queue);
    queue.enqueue = async (
      request: Parameters<typeof enqueue>[0],
    ): Promise<string> => {
      enqueued.push(request.type);
      return enqueue(request);
    };
    harness.getMockShell().getJobQueueService = (): typeof queue => queue;
    return enqueued;
  }

  test("waits for registration to complete after a successful initial sync", async () => {
    const harness = createHarness();
    const enqueued = captureEnqueues(harness);
    const plugin = profilePlugin();
    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );
    expect(enqueued).toEqual([]);

    await plugin.ready?.();
    expect(
      enqueued.filter((type) => type.includes("seed-starter-identity")).length,
    ).toBe(1);
  });

  test("seeds when the sync signal arrives after registration", async () => {
    const harness = createHarness();
    const enqueued = captureEnqueues(harness);
    const plugin = profilePlugin();
    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    await plugin.ready?.();
    expect(enqueued).toEqual([]);

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );
    expect(
      enqueued.filter((type) => type.includes("seed-starter-identity")).length,
    ).toBe(1);
  });

  test("enqueues once, however many sync signals arrive", async () => {
    const harness = createHarness();
    const enqueued = captureEnqueues(harness);
    const plugin = profilePlugin();
    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    await plugin.ready?.();

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );
    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );

    expect(
      enqueued.filter((type) => type.includes("seed-starter-identity")).length,
    ).toBe(1);
  });

  test("does nothing when the initial sync fails", async () => {
    const harness = createHarness();
    const enqueued = captureEnqueues(harness);
    const plugin = profilePlugin();
    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    await plugin.ready?.();

    await harness.sendMessage(
      "sync:initial:completed",
      { success: false },
      "directory-sync",
    );

    expect(enqueued).toEqual([]);
  });

  test("declares no starter subscription when the flow is disabled", async () => {
    const harness = createHarness();
    const enqueued = captureEnqueues(harness);
    const plugin = profilePlugin({ starterIdentity: { enabled: false } });
    await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    await plugin.ready?.();

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );

    expect(enqueued).toEqual([]);
  });
});
