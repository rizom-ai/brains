import { describe, expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  brainCharacterBodySchema,
  parseMarkdownWithFrontmatter,
  type ServicePluginContext,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import {
  STARTER_ALIAS_REGISTER,
  buildStarterCharacterBrief,
  buildStarterCharacterPrompt,
  deriveStarterIdentity,
  generatedStarterCharacterSchema,
  isLegacyAnchorProfileContent,
  isLegacyBrainCharacterContent,
  ProfilePlugin,
  resolveStarterIdentityIdentifier,
  type GeneratedStarterCharacter,
  type ProfileConfigInput,
  type StarterCharacterBrief,
} from "../src";

const rawFrontmatterSchema = z.record(z.string(), z.unknown());

function createHarness(
  domain: string = "notes.example.com",
): ReturnType<typeof createPluginHarness> {
  return createPluginHarness({
    dataDir: `/tmp/test-starter-identity-${randomUUID()}`,
    domain,
  });
}

const generatedCharacter: GeneratedStarterCharacter = {
  role: "Connected knowledge operator",
  purpose:
    "Connect available knowledge into grounded material that people can use.",
  values: ["source fidelity", "clear context", "useful synthesis"],
};

interface TestProfilePluginOptions {
  config?: ProfileConfigInput;
  character?: GeneratedStarterCharacter;
  onGenerate?: (prompt: string) => void;
  generateCharacter?: (
    brief: StarterCharacterBrief,
  ) => Promise<GeneratedStarterCharacter>;
}

class TestProfilePlugin extends ProfilePlugin {
  private readonly testOptions: TestProfilePluginOptions;

  constructor(options: TestProfilePluginOptions = {}) {
    super(options.config);
    this.testOptions = options;
  }

  protected override async generateCharacter(
    _context: ServicePluginContext,
    brief: StarterCharacterBrief,
  ): Promise<GeneratedStarterCharacter> {
    this.testOptions.onGenerate?.(buildStarterCharacterPrompt(brief));
    if (this.testOptions.generateCharacter) {
      return this.testOptions.generateCharacter(brief);
    }
    return this.testOptions.character ?? generatedCharacter;
  }
}

function createTestProfilePlugin(
  options: TestProfilePluginOptions = {},
): ProfilePlugin {
  return new TestProfilePlugin(options);
}

async function signalShellReady(
  harness: ReturnType<typeof createHarness>,
): Promise<void> {
  await harness.sendMessage("system:shell:ready", {}, "shell");
}

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
    const first = deriveStarterIdentity("domain:notes.example.com", "person");
    const second = deriveStarterIdentity("domain:notes.example.com", "person");

    expect(second).toEqual(first);
  });

  test("uses the same agent alias register for every anchor kind", () => {
    const identifier = "domain:notes.example.com";
    const person = deriveStarterIdentity(identifier, "person");
    const team = deriveStarterIdentity(identifier, "team");
    const organization = deriveStarterIdentity(identifier, "organization");

    expect(team.name).toBe(person.name);
    expect(organization.name).toBe(person.name);
    expect([
      person.anchorKind,
      team.anchorKind,
      organization.anchorKind,
    ]).toEqual(["person", "team", "organization"]);
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
      anchorKind: "team",
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
      anchorKind: "person",
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

  test("recognizes the canonical anchor default only when unauthored", () => {
    expect(isLegacyAnchorProfileContent(legacyAnchor)).toBe(true);
    expect(isLegacyAnchorProfileContent("---\nname: Unknown\n---\n")).toBe(
      false,
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

describe("starter identity lifecycle", () => {
  test("waits for shell readiness after successful initial sync", async () => {
    const harness = createHarness();
    let generationCalls = 0;
    await harness.installPlugin(
      createTestProfilePlugin({
        onGenerate: () => {
          generationCalls += 1;
        },
      }),
    );

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );

    expect(generationCalls).toBe(0);
    expect(
      await harness.getEntityService().getEntity({
        entityType: "brain-character",
        id: "brain-character",
      }),
    ).toBeNull();

    await harness.sendMessage("system:shell:ready", {}, "shell");

    expect(generationCalls).toBe(1);
    expect(
      await harness.getEntityService().getEntity({
        entityType: "brain-character",
        id: "brain-character",
      }),
    ).not.toBeNull();
  });

  test("seeds missing identity after successful initial sync", async () => {
    const harness = createHarness();
    let generationPrompt = "";
    await harness.installPlugin(
      createTestProfilePlugin({
        config: { starterIdentity: { anchorKind: "team" } },
        onGenerate: (prompt) => {
          generationPrompt = prompt;
        },
      }),
    );
    await signalShellReady(harness);

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );

    const brain = await harness.getEntityService().getEntity({
      entityType: "brain-character",
      id: "brain-character",
    });
    const anchor = await harness.getEntityService().getEntity({
      entityType: "anchor-profile",
      id: "anchor-profile",
    });

    expect(brain).not.toBeNull();
    expect(anchor).not.toBeNull();
    if (!brain || !anchor) throw new Error("Starter identity was not created");

    const character = parseMarkdownWithFrontmatter(
      brain.content,
      brainCharacterBodySchema,
    ).metadata;
    const profile = parseMarkdownWithFrontmatter(
      anchor.content,
      rawFrontmatterSchema,
    );

    expect(character.name).not.toBe("Brain");
    expect(character.role).toBe(generatedCharacter.role);
    expect(character.purpose).toBe(generatedCharacter.purpose);
    expect(character.values).toEqual(generatedCharacter.values);
    expect(profile.metadata["kind"]).toBe("team");
    expect(profile.metadata["name"]).toBe(`Anchor for ${character.name}`);
    expect(profile.content).toContain("picked");
    expect(generationPrompt).toContain('"anchorKind": "team"');
  });

  test("migrates exact defaults and is idempotent", async () => {
    const harness = createHarness();
    let generationCalls = 0;
    await harness.installPlugin(
      createTestProfilePlugin({
        onGenerate: () => {
          generationCalls += 1;
        },
      }),
    );
    await signalShellReady(harness);
    await harness.getEntityService().createEntity({
      entity: {
        id: "brain-character",
        entityType: "brain-character",
        content: currentLegacyBrain,
        metadata: {},
      },
    });
    await harness.getEntityService().createEntity({
      entity: {
        id: "anchor-profile",
        entityType: "anchor-profile",
        content: legacyAnchor,
        metadata: {},
      },
    });

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );
    const migratedBrain = await harness.getEntityService().getEntity({
      entityType: "brain-character",
      id: "brain-character",
    });
    const migratedAnchor = await harness.getEntityService().getEntity({
      entityType: "anchor-profile",
      id: "anchor-profile",
    });
    if (!migratedBrain || !migratedAnchor) {
      throw new Error("Legacy identity disappeared during migration");
    }

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );
    const repeatedBrain = await harness.getEntityService().getEntity({
      entityType: "brain-character",
      id: "brain-character",
    });
    const repeatedAnchor = await harness.getEntityService().getEntity({
      entityType: "anchor-profile",
      id: "anchor-profile",
    });

    expect(migratedBrain.content).not.toBe(currentLegacyBrain);
    expect(migratedAnchor.content).not.toBe(legacyAnchor);
    expect(repeatedBrain?.content).toBe(migratedBrain.content);
    expect(repeatedAnchor?.content).toBe(migratedAnchor.content);
    expect(generationCalls).toBe(1);
  });

  test("migrates a legacy anchor without generating over its customized brain", async () => {
    const harness = createHarness();
    let generationCalls = 0;
    await harness.installPlugin(
      createTestProfilePlugin({
        generateCharacter: async () => {
          generationCalls += 1;
          throw new Error("AI should not be called");
        },
      }),
    );
    await signalShellReady(harness);
    const customBrain = `---
name: Atlas
role: Research partner
purpose: Keep project knowledge connected
values:
  - context
---
`;
    await harness.getEntityService().createEntity({
      entity: {
        id: "brain-character",
        entityType: "brain-character",
        content: customBrain,
        metadata: {},
      },
    });
    await harness.getEntityService().createEntity({
      entity: {
        id: "anchor-profile",
        entityType: "anchor-profile",
        content: legacyAnchor,
        metadata: {},
      },
    });

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );

    const brain = await harness.getEntityService().getEntity({
      entityType: "brain-character",
      id: "brain-character",
    });
    const anchor = await harness.getEntityService().getEntity({
      entityType: "anchor-profile",
      id: "anchor-profile",
    });
    expect(brain?.content).toBe(customBrain);
    expect(anchor?.content).toContain("name: Anchor for Atlas");
    expect(generationCalls).toBe(0);
  });

  test("preserves non-public authored identity without taking the create branch", async () => {
    const harness = createHarness();
    let generationCalls = 0;
    await harness.installPlugin(
      createTestProfilePlugin({
        onGenerate: () => {
          generationCalls += 1;
        },
      }),
    );
    await signalShellReady(harness);

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
    const entityService = harness.getEntityService();
    await entityService.createEntity({
      entity: {
        id: "brain-character",
        entityType: "brain-character",
        content: customBrain,
        metadata: {},
      },
    });
    await entityService.createEntity({
      entity: {
        id: "anchor-profile",
        entityType: "anchor-profile",
        content: customAnchor,
        metadata: {},
        visibility: "restricted",
      },
    });
    const createEntity = spyOn(entityService, "createEntity");
    const getEntity = spyOn(entityService, "getEntity");

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );

    const anchor = await entityService.getEntity({
      entityType: "anchor-profile",
      id: "anchor-profile",
      visibilityScope: "restricted",
    });
    expect(anchor?.content).toBe(customAnchor);
    expect(getEntity).toHaveBeenCalledWith({
      entityType: "brain-character",
      id: "brain-character",
      visibilityScope: "restricted",
    });
    expect(getEntity).toHaveBeenCalledWith({
      entityType: "anchor-profile",
      id: "anchor-profile",
      visibilityScope: "restricted",
    });
    expect(createEntity).not.toHaveBeenCalled();
    expect(generationCalls).toBe(0);
  });

  test("preserves independently customized singletons without calling AI", async () => {
    const harness = createHarness();
    let generationCalls = 0;
    await harness.installPlugin(
      createTestProfilePlugin({
        onGenerate: () => {
          generationCalls += 1;
        },
      }),
    );
    await signalShellReady(harness);
    const customBrain = currentLegacyBrain.replace(
      "role: Knowledge assistant",
      "role: Research partner",
    );
    const customAnchor = `---
name: Ada
kind: person
intro: Custom profile
---
Authored story.
`;
    await harness.getEntityService().createEntity({
      entity: {
        id: "brain-character",
        entityType: "brain-character",
        content: customBrain,
        metadata: {},
      },
    });
    await harness.getEntityService().createEntity({
      entity: {
        id: "anchor-profile",
        entityType: "anchor-profile",
        content: customAnchor,
        metadata: {},
      },
    });

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );

    expect(
      (
        await harness.getEntityService().getEntity({
          entityType: "brain-character",
          id: "brain-character",
        })
      )?.content,
    ).toBe(customBrain);
    expect(
      (
        await harness.getEntityService().getEntity({
          entityType: "anchor-profile",
          id: "anchor-profile",
        })
      )?.content,
    ).toBe(customAnchor);
    expect(generationCalls).toBe(0);
  });

  test("defers all mutation after AI failure and retries later", async () => {
    const harness = createHarness();
    let shouldFail = true;
    await harness.installPlugin(
      createTestProfilePlugin({
        generateCharacter: async () => {
          if (shouldFail) throw new Error("Provider unavailable");
          return generatedCharacter;
        },
      }),
    );
    await signalShellReady(harness);

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );
    expect(
      await harness.getEntityService().getEntity({
        entityType: "brain-character",
        id: "brain-character",
      }),
    ).toBeNull();
    expect(
      await harness.getEntityService().getEntity({
        entityType: "anchor-profile",
        id: "anchor-profile",
      }),
    ).toBeNull();

    shouldFail = false;
    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );
    expect(
      await harness.getEntityService().getEntity({
        entityType: "brain-character",
        id: "brain-character",
      }),
    ).not.toBeNull();
    expect(
      await harness.getEntityService().getEntity({
        entityType: "anchor-profile",
        id: "anchor-profile",
      }),
    ).not.toBeNull();
  });

  test("does nothing when initial sync fails", async () => {
    const harness = createHarness();
    let generationCalls = 0;
    await harness.installPlugin(
      createTestProfilePlugin({
        onGenerate: () => {
          generationCalls += 1;
        },
      }),
    );
    await signalShellReady(harness);

    await harness.sendMessage(
      "sync:initial:completed",
      { success: false },
      "directory-sync",
    );

    expect(
      await harness.getEntityService().getEntity({
        entityType: "brain-character",
        id: "brain-character",
      }),
    ).toBeNull();
    expect(generationCalls).toBe(0);
  });
});
