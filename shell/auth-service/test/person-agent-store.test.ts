import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthRuntimeDatabase } from "../src/runtime-db";
import { PersonAgentStore } from "../src/person-agent-store";
import { AuthUserStore } from "../src/user-store";

const tempDirs: string[] = [];

async function withStores<T>(
  callback: (users: AuthUserStore, links: PersonAgentStore) => Promise<T>,
): Promise<T> {
  const storageDir = await mkdtemp(join(tmpdir(), "brains-person-agent-"));
  tempDirs.push(storageDir);
  const database = new AuthRuntimeDatabase({ storageDir });
  await database.start();
  try {
    return await callback(
      new AuthUserStore(database.db),
      new PersonAgentStore(database.db),
    );
  } finally {
    await database.stop();
  }
}

async function expectRejectsWithMessage(
  operation: Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    if (error instanceof Error) {
      expect(error.message).toBe(message);
    }
    return;
  }
  throw new Error("Expected operation to reject");
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("PersonAgentStore", () => {
  it("creates a pending representation when an anchor links another person", async () => {
    await withStores(async (users, links) => {
      const anchor = await users.ensureFirstAnchorUser({
        displayName: "Anchor",
      });
      const person = await users.createPerson({ displayName: "Mira Reyes" });

      const link = await links.linkAgent({
        agentId: "agent:mira-field",
        personId: person.id,
        createdByUserId: anchor.id,
      });

      expect(link).toMatchObject({
        agentId: "agent:mira-field",
        personId: person.id,
        status: "pending",
        createdByUserId: anchor.id,
        consentedByUserId: null,
      });
    });
  });

  it("activates immediately when a user links their own person", async () => {
    await withStores(async (users, links) => {
      const user = await users.createUser({ displayName: "Mira Reyes" });

      const link = await links.linkAgent({
        agentId: "agent:mira-field",
        personId: user.personId,
        createdByUserId: user.id,
      });

      expect(link).toMatchObject({
        status: "active",
        consentedByUserId: user.id,
      });
    });
  });

  it("lets the represented person accept a pending link", async () => {
    await withStores(async (users, links) => {
      const anchor = await users.ensureFirstAnchorUser({
        displayName: "Anchor",
      });
      const person = await users.createPerson({ displayName: "Mira Reyes" });
      await links.linkAgent({
        agentId: "agent:mira-field",
        personId: person.id,
        createdByUserId: anchor.id,
      });
      const invited = await users.createUser({
        displayName: "Mira Reyes",
        personId: person.id,
        status: "invited",
      });

      const accepted = await links.acceptRepresentation(
        "agent:mira-field",
        invited.id,
      );

      expect(accepted).toMatchObject({
        status: "active",
        consentedByUserId: invited.id,
      });
    });
  });

  it("rejects consent from a user representing another person", async () => {
    await withStores(async (users, links) => {
      const anchor = await users.ensureFirstAnchorUser({
        displayName: "Anchor",
      });
      const person = await users.createPerson({ displayName: "Mira Reyes" });
      await links.linkAgent({
        agentId: "agent:mira-field",
        personId: person.id,
        createdByUserId: anchor.id,
      });
      const other = await users.createUser({ displayName: "Other Person" });

      await expectRejectsWithMessage(
        links.acceptRepresentation("agent:mira-field", other.id),
        "Only the represented person can accept this agent link",
      );
    });
  });

  it("does not let one agent silently switch represented people", async () => {
    await withStores(async (users, links) => {
      const anchor = await users.ensureFirstAnchorUser({
        displayName: "Anchor",
      });
      const first = await users.createPerson({ displayName: "First" });
      const second = await users.createPerson({ displayName: "Second" });
      await links.linkAgent({
        agentId: "agent:shared",
        personId: first.id,
        createdByUserId: anchor.id,
      });

      await expectRejectsWithMessage(
        links.linkAgent({
          agentId: "agent:shared",
          personId: second.id,
          createdByUserId: anchor.id,
        }),
        "Agent is already linked to another person",
      );
    });
  });
});
