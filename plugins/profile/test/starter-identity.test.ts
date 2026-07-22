import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  brainCharacterBodySchema,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import {
  deriveStarterIdentity,
  isLegacyAnchorProfileContent,
  isLegacyBrainCharacterContent,
  ProfilePlugin,
  resolveStarterIdentityIdentifier,
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
  test("is deterministic for the same identifier", () => {
    const first = deriveStarterIdentity("domain:notes.example.com", "person");
    const second = deriveStarterIdentity("domain:notes.example.com", "person");

    expect(second).toEqual(first);
  });

  test("uses kind-specific naming registers", () => {
    const identifier = "domain:notes.example.com";
    const person = deriveStarterIdentity(identifier, "person");
    const team = deriveStarterIdentity(identifier, "team");
    const organization = deriveStarterIdentity(identifier, "organization");

    expect(
      new Set([
        person.brainCharacter.name,
        team.brainCharacter.name,
        organization.brainCharacter.name,
      ]).size,
    ).toBe(3);
  });

  test("resolves identifiers in DID, handle, domain order", () => {
    expect(
      resolveStarterIdentityIdentifier({
        did: "did:plc:abc",
        handle: "brain.example.com",
        domain: "example.com",
      }),
    ).toBe("did:did:plc:abc");
    expect(
      resolveStarterIdentityIdentifier({
        handle: "@Brain.Example.com",
        domain: "example.com",
      }),
    ).toBe("handle:brain.example.com");
    expect(
      resolveStarterIdentityIdentifier({ domain: "https://Example.com/" }),
    ).toBe("domain:example.com");
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
  test("seeds missing identity after successful initial sync", async () => {
    const harness = createHarness();
    await harness.installPlugin(
      new ProfilePlugin({
        starterIdentity: { anchorKind: "team" },
      }),
    );

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
    expect(profile.metadata["kind"]).toBe("team");
    expect(profile.metadata["name"]).toBe(`Anchor for ${character.name}`);
    expect(profile.content).toContain("picked");
  });

  test("migrates exact defaults and is idempotent", async () => {
    const harness = createHarness();
    await harness.installPlugin(new ProfilePlugin());
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
  });

  test("migrates one default singleton without overwriting its customized counterpart", async () => {
    const harness = createHarness();
    await harness.installPlugin(new ProfilePlugin());
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
  });

  test("preserves independently customized singletons", async () => {
    const harness = createHarness();
    await harness.installPlugin(new ProfilePlugin());
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
  });

  test("does nothing when initial sync fails", async () => {
    const harness = createHarness();
    await harness.installPlugin(new ProfilePlugin());

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
  });
});
