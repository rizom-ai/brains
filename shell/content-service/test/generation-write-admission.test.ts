import { expect, test } from "bun:test";
import assert from "node:assert/strict";
import { EntityWriteAdmissions } from "@brains/entity-service";
import { createTestEntity } from "@brains/entity-service/test";
import {
  generationWriteAdmission,
  registerGenerationWriteAdmission,
} from "../src/generation-write-admission";
import type { ContentGenerationJobData } from "../src/generation-contracts";
import type { GenerationWriteAuthorizationData } from "../src/generation-write-authorization";

const data: ContentGenerationJobData = {
  authority: {
    actor: { kind: "user", userId: "usr_writer", canonicalId: undefined },
    principalId: "usr_writer",
    permissionCeiling: "trusted",
  },
  templateName: "fixture:note",
  context: { prompt: "large prompt".repeat(10_000) },
  destination: {
    entityType: "note",
    entityId: "target",
    visibility: "shared",
    metadata: { body: "large metadata".repeat(10_000) },
  },
  expectedRevision: null,
};

test("generation admission carries authority and identity, not prompts or caller metadata", () => {
  expect(generationWriteAdmission(data)).toEqual({
    name: "content:generation",
    payload: {
      authority: {
        actor: { kind: "user", userId: "usr_writer" },
        principalId: "usr_writer",
        permissionCeiling: "trusted",
      },
      templateName: "fixture:note",
      expectedRevision: null,
      destination: {
        entityType: "note",
        entityId: "target",
        visibility: "shared",
      },
    },
  });
});

test("owner generation admission uses final metadata and refuses a mismatched mutation operation", async () => {
  const registry = new EntityWriteAdmissions();
  const checked: GenerationWriteAuthorizationData[] = [];
  const unregister = registerGenerationWriteAdmission(registry, {
    authorizeGenerationWrite: async (intent, persisted) => {
      assert(persisted);
      expect(intent.destination.metadata).toEqual(persisted.metadata);
      checked.push(intent);
      return { permissionLevel: "trusted", visibilityScope: "shared" };
    },
  });
  const options = { writeAdmission: generationWriteAdmission(data) };
  const entity = createTestEntity("note", {
    id: "target",
    visibility: "shared",
    metadata: { status: "published" },
  });
  const create = registry.prepare(options, "create");
  const update = registry.prepare(options, "update");
  assert(create && update);
  await create(entity);
  expect(checked[0]?.destination.metadata).toEqual({ status: "published" });
  await assert.rejects(update(entity), {
    name: "GenerationAuthorizationError",
  });
  expect(checked).toHaveLength(1);
  unregister();
  await assert.rejects(create(entity), /removed/);
});
